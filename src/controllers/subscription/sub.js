import stripePackage from 'stripe';
import Price from '../../models/price.js';
import Payment from '../../models/payment.js';
import Discount from '../../models/discount.js';

const stripe = stripePackage(process.env.STRIPE_SECRET_KEY);

// Get price for a plan
const getPlanPrice = async (plan, period) => {
  const pricing = await Price.findOne();
  if (!pricing) throw new Error('Pricing not configured');
  
  if (plan === 'basic') {
    return period === 'year' 
      ? pricing.basic.perYear.price 
      : pricing.basic.perMonth.price;
  } else if (plan === 'premium') {
    return period === 'year' 
      ? pricing.premium.perYear.price 
      : pricing.premium.perMonth.price;
  }
  throw new Error('Invalid plan');
};

// Create subscription with trial
export const createSubscription = async (user, plan, period, discountCode = '') => {
  const price = await getPlanPrice(plan, period);
  
  // Apply discount if available
  let discount = 0;
  if (discountCode) {
    const discountRecord = await Discount.findOne({ token: discountCode });
    if (discountRecord && discountRecord.for === 'subscription') {
      discount = discountRecord.value;
    }
  }
  
  const amount = Math.max(0, price - discount) * 100;
  
  // Create payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    customer: user.stripeCustomerId,
    payment_method: user.stripePaymentMethodId,
    off_session: true,
    confirm: true,
    metadata: {
      userId: user._id.toString(),
      plan,
      period,
      type: 'subscription',
      discount: discount.toString(),
    },
  });
  
  // Calculate next billing date
  const nextBillingDate = new Date();
  if (period === 'year') {
    nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
  } else {
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
  }
  
  // Update user
  user.subscription = plan;
  user.period = period;
  user.nextBillingDate = nextBillingDate;
  user.trial_used = true;
  await user.save();
  
  // Save payment
  await Payment.create({
    user: user._id,
    amount: amount / 100,
    discount,
    plan,
    period,
    status: 'succeeded',
    paymentIntentId: paymentIntent.id,
  });
  
  return { success: true, nextBillingDate };
};

// Charge for subscription renewal
export const renewSubscription = async (user) => {
  if (!user.stripePaymentMethodId || !user.stripeCustomerId) {
    throw new Error('Payment method not set');
  }
  
  const price = await getPlanPrice(user.subscription, user.period);
  const amount = price * 100;
  
  // Create payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    customer: user.stripeCustomerId,
    payment_method: user.stripePaymentMethodId,
    off_session: true,
    confirm: true,
    metadata: {
      userId: user._id.toString(),
      plan: user.subscription,
      period: user.period,
      type: 'renewal',
    },
  });
  
  // Update next billing date
  const nextBillingDate = new Date();
  if (user.period === 'year') {
    nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
  } else {
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
  }
  
  user.nextBillingDate = nextBillingDate;
  await user.save();
  
  // Save payment
  await Payment.create({
    user: user._id,
    amount: amount / 100,
    plan: user.subscription,
    period: user.period,
    status: 'succeeded',
    paymentIntentId: paymentIntent.id,
  });
  
  return { success: true, nextBillingDate };
};

// Downgrade subscription
export const downgradeSubscription = async (user, downgradeTo) => {
  user.downgrade = true;
  user.downgradeTo = downgradeTo;
  await user.save();
  return { success: true };
};

// Cancel subscription
export const cancelSubscription = async (user) => {
  user.subscription = 'none';
  user.nextBillingDate = null;
  await user.save();
  return { success: true };
};

// Upgrade subscription with proration
export const upgradeSubscription = async (user, upgradeTo) => {
  const pricing = await Price.findOne();
  if (!pricing) throw new Error('Pricing not configured');
  
  // Get current and new prices
  const currentPrice = await getPlanPrice(user.subscription, user.period);
  const newPrice = await getPlanPrice(upgradeTo, user.period);
  
  // Calculate proration
  const daysUsed = (new Date() - user.nextBillingDate) / (1000 * 60 * 60 * 24);
  const daysInMonth = 30; // Approximation
  const prorationAmount = Math.round((newPrice - currentPrice) * (daysUsed / daysInMonth) * 100);
  
  // Charge for proration
  if (prorationAmount > 0) {
    await stripe.paymentIntents.create({
      amount: prorationAmount,
      currency: 'usd',
      customer: user.stripeCustomerId,
      payment_method: user.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        userId: user._id.toString(),
        type: 'proration',
        upgradeFrom: user.subscription,
        upgradeTo,
      },
    });
  }
  
  // Update user
  user.subscription = upgradeTo;
  await user.save();
  
  return { success: true };
};

// Apply discount to subscription
export const applyDiscount = async (user, discountCode) => {
  const discount = await Discount.findOne({ token: discountCode });
  if (!discount) throw new Error('Invalid discount code');
  
  // Save discount to user
  user.discounts = user.discounts || [];
  user.discounts.push(discount._id);
  await user.save();
  
  return { success: true, discountValue: discount.value };
};