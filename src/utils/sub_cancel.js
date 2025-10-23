// src/cron/subscriptionUpdater.js
import cron from 'node-cron';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import User from '../models/user';
import Payment from '../models/payment';
import Price from '../models/price';
import dotenv from 'dotenv';
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function checkSubscriptions() {
  console.log('⏱ Reconciliation pass at', new Date().toISOString());

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  const priceDoc = await Price.findOne();
  if (!priceDoc) {
    console.error('⚠️  Missing Price config');
    return;
  }

  const now = new Date();
  const due = await User.find({
    stripeSubscriptionId: { $exists: true, $ne: null }
  });

  console.log(`🔍 ${due.length} user(s) with active subscriptions`);

  for (let user of due) {
    console.log(`\n— User ${user._id} (trial_used=${user.trial_used}) —`);

    try {
      const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      console.log('  Stripe status:', sub.status);

      // Check if the subscription has been renewed (within the cron job interval)
      const lastCheckedDate = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 1 day before current time
      const subStartDate = new Date(sub.start_date * 1000); // Convert to JavaScript Date

      if (subStartDate >= lastCheckedDate && subStartDate <= now) {
        console.log('   🔄 Subscription renewed');
      }

      // If the subscription is not active or failed, cancel it locally
      if (sub.status !== 'active' && sub.status !== 'trialing') {
        console.log('   🔴 subscription ended or failed at Stripe, cancelling locally');
        user.subscription = 'none';
        user.nextBillingDate = null;
        user.downgrade = true;
        await user.save();
        continue;
      }

      // Handle downgrades to 'basic' plan
      let planKey = user.subscription;
      if (user.downgrade && planKey === 'premium') {
        planKey = 'basic';
        user.subscription = 'basic';
        user.downgrade = false;
        console.log('   ↘ Downgraded this cycle → basic');
        // Update Stripe subscription plan to 'basic'
        const price = priceDoc.basic[user.period === 'year' ? 'perYear' : 'perMonth'];
        await stripe.subscriptions.update(sub.id, {
          items: [{
            id: sub.items.data[0].id,
            price: price.stripePriceId // Use appropriate price ID from Price schema
          }]
        });
      }
      const bucket = priceDoc[planKey][user.period === 'year' ? 'perYear' : 'perMonth'];
      console.log("bucket");

      // Create and pay invoice
      const invoice = await stripe.invoices.create({
        customer: sub.customer,
        subscription: sub.id,
        auto_advance: true
      });
      console.log('   → Invoice created', invoice.id);

      try {
        const paidInvoice = await stripe.invoices.pay(invoice.id);

        if (paidInvoice.status === 'paid') {
          console.log('   ✔️ Invoice paid');

          // Check if the user is already subscribed today
          const today = new Date();
          const todayString = today.toISOString().split('T')[0]; // Get the date in YYYY-MM-DD format

          // If the user was already subscribed today, skip payment creation and token awarding
          if (user.subscribed_At && user.subscribed_At.toISOString().split('T')[0] === todayString) {
            console.log('   🔄 User is already subscribed today. Skipping payment creation and token awarding.');
            continue;
          }

          if (user.nextBillingDate && user.nextBillingDate.toISOString().split('T')[0] !== todayString) {
            console.log('   🔄 Today is not the next billing date. Skipping token awarding.');
            continue;  // Skip if today is not the renewal day (next billing date)
          }

          // Award tokens and record payment
          user.tokens += bucket.tokens;
          user.status = 'active';
          if (!user.trial_used) user.trial_used = true;

          const paymentCount = await Payment.countDocuments();
          const uniquePaymentId = `P-${1000 + paymentCount + 1}`;

          await Payment.create({
            user: user._id,
            data: planKey,
            paymentid: uniquePaymentId,
            payment: bucket.price,
            discount: null,
            discountValue: 0,
            tokens: bucket.tokens,
            status: 'paid',
            period: user.period,
            stripeSubscriptionId: sub.id
          });

          console.log(`   ➕ Awarded ${bucket.tokens} tokens (total: ${user.tokens})`);
          user.subscribed_At = new Date(Date.now()); // Update the subscription date

          // Update nextBillingDate based on subscription period
          if (user.period === 'year') {
            user.nextBillingDate = new Date(today.setFullYear(today.getFullYear() + 1)); // Next year
          } else {
            user.nextBillingDate = new Date(today.setMonth(today.getMonth() + 1)); // Next month
          }
          await user.save();
          console.log('   🔜 Next billing in 5 min');

        } else {
          throw new Error(`Invoice status is "${paidInvoice.status}", not "paid"`);
        }


      } catch (err) {
        console.error('   ❌ Payment failed:', err.message);
        console.log('   🔴 cancelling user locally');
        user.subscription = 'none';
        user.nextBillingDate = null;
        user.downgrade = true;
        await user.save();

        await Payment.findOneAndUpdate(
          { stripeSubscriptionId: sub.id, status: { $in: ['paid', 'trialing'] } },
          { status: 'cancelled' }
        );
        continue;
      }

    } catch (err) {
      console.error('  ⚠️  Unexpected error:', err.message);
    }
  }

  console.log('\n🏁 Reconciliation pass complete\n');
}

cron.schedule('0 0 * * *', () => {
  checkSubscriptions().catch(console.error);
}, {
  timezone: 'America/Toronto'
});

// Run once at startup
checkSubscriptions().catch(console.error);
