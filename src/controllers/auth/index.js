import Boom from "@hapi/boom"; // Preferred
import User from "../../models/user";
import mongoose from 'mongoose';
import Admin from "../../models/admin.js";
import Price from "../../models/price";
import Mytribe from "../../models/mytribes.js";
import Message from "../../models/Message.js";
import Notification from "../../models/notifications.js";
import Discount from "../../models/discount.js";
import Payment from "../../models/payment.js";
const bcrypt = require('bcrypt');
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../helpers/jwt";
import ValidationSchema from "./validations";
const redis = require("../../clients/redis").default;

import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const nodemailer = require('nodemailer');
const crypto = require('crypto'); // For generating a unique verification token
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com', // Hostinger SMTP server
  port: 465,  // Port number for Hostinger SMTP (587 for TLS)
  secure: true,  // TLS/SSL setting (use 'true' for port 465, 'false' for port 587)
  auth: {
    user: "no-reply@openpreneurs.business", // Replace with your Hostinger email
    pass: "1mpactLiv!ng",  // Replace with your email password
  },
});

const { v4: uuidv4 } = require("uuid");
const { Storage } = require("@google-cloud/storage");

// Instantiate once (will pick up GOOGLE_APPLICATION_CREDENTIALS)
const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID, // make sure this is set in .env
});
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

// Function to upload files to Firebase and get the public URL
// Function to upload files to GCS and get the public URL
export const handleFirebaseUpload = async (file, folder, nameFormat) => {
  const fileName = `${nameFormat}-${uuidv4()}-${file.originalname}`;
  const filePath = `${folder}/${fileName}`;
  const blob = bucket.file(filePath);

  // Upload buffer
  await blob.save(file.buffer, {
    resumable: false,
    metadata: { contentType: file.mimetype },
  });
  // Return the public URL
  return `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(filePath)}`;
};

export const deleteFromFirebase = async (publicUrl) => {
  try {
    // Extract the path after bucket name
    const parts = publicUrl.split(`${bucket.name}/`);
    if (parts.length !== 2) throw new Error(`Unexpected URL format: ${publicUrl}`);
    const filePath = decodeURIComponent(parts[1]);

    await bucket.file(filePath).delete();
  } catch (err) {
    console.error("GCS deletion error:", err);
    // Re-throw with original message for debugging
    throw new Error(`Failed to delete ${publicUrl}: ${err.message}`);
  }
};

const createFirstCoupon = async (discountValue) => {
  const coupon = await stripe.coupons.create({
    percent_off: discountValue,
    duration: 'once', // Only for the first payment
  });
  return coupon.id;
};


const Register = async (req, res, next) => {
  const input = req.body;
  const redis = require("../../clients/redis").default;

  // Validate input
  const { error } = ValidationSchema.validate(input);

  // Required field checks
  if (!input.firstName || !input.lastName) {
    return next(Boom.badRequest("First name and last name are required."));
  }

  if (!input.plan || !input.period) {
    return next(Boom.badRequest("Subscription plan and period are required."));
  }

  let stripeCustomerId = null;
  let discountDoc = null;
  let discountValue = 0;

  try {
    // Check email and username concurrently
    const [emailExists, usernameExists] = await Promise.all([
      User.findOne({ email: input.email }),
      User.findOne({ username: input.username })
    ]);

    if (emailExists) return next(Boom.conflict("This e-mail is already in use."));
    if (usernameExists) return next(Boom.conflict("This username is already in use."));

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: input.email,
      name: `${input.firstName} ${input.lastName}`,
    });
    stripeCustomerId = customer.id;

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Prepare user data for Redis
    const userData = {
      ...input,
      verified: "No",
      verificationToken,
      stripeCustomerId,
      status: "pending_payment",
      tokens: 0,
      trial_used: false
    };

    // Save to Redis with 1 hour expiration
    await redis.setex(`temp_user:${stripeCustomerId}`, 3600, JSON.stringify(userData));

    // Validate discount code
    if (input.discountCode) {
      discountDoc = await Discount.findOne({ token: input.discountCode });

      if (discountDoc) {
        if (discountDoc.for !== 'subscription') {
          throw Boom.badRequest("This discount is not for subscriptions");
        }

        if (discountDoc.used_by.length >= discountDoc.numberOfUses) {
          throw Boom.badRequest("Discount limit reached");
        }

        if (discountDoc.used_by.includes(input.username)) {
          throw Boom.badRequest("You've already used this discount");
        }

        if (discountDoc.period && discountDoc.period !== input.period) {
          throw Boom.badRequest(`This discount is not valid for the ${input.period} period`);
        }

        if (discountDoc.plan && discountDoc.plan !== input.plan) {
          throw Boom.badRequest(`This discount is not valid for the ${input.plan} plan`);
        }

        discountValue = discountDoc.value;
      }
    }

    // Get pricing
    const pricing = await Price.findOne();
    if (!pricing) throw Boom.badImplementation("Pricing not configured");

    // Calculate price and tokens
    let price = 0;
    let tokens = 0;
    const billingPeriod = input.period === "year" ? "perYear" : "perMonth";

    if (input.plan === "basic") {
      price = pricing.basic[billingPeriod].price;
      tokens = pricing.basic[billingPeriod].tokens;
    } else if (input.plan === "premium") {
      price = pricing.premium[billingPeriod].price;
      tokens = pricing.premium[billingPeriod].tokens;
    } else {
      throw Boom.badRequest("Invalid plan");
    }

    // Apply discount
    const discountedPrice = Math.max(0, Math.round((price - (price * discountValue / 100)) * 100) / 100);
    const amountInCents = Math.round(price * 100);
    let couponId = null;

    if (discountValue) {
      couponId = await createFirstCoupon(discountValue);
    }



    // Create Stripe product
    const product = await stripe.products.create({
      name: `${input.plan.charAt(0).toUpperCase() + input.plan.slice(1)} Plan (${input.period})`,
      metadata: {
        plan: input.plan,
        period: input.period,
        discountApplied: !!input.discountCode,
      }
    });

    // Create price object
    const priceObj = await stripe.prices.create({
      currency: "usd",
      unit_amount: amountInCents,
      recurring: { interval: input.period === "year" ? "year" : "month" },
      product: product.id
    });

    // Attach payment method
    await stripe.paymentMethods.attach(input.paymentMethodId, { customer: stripeCustomerId });
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: input.paymentMethodId }
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceObj.id }],
      discounts: couponId ? [{ coupon: couponId }] : [],
      trial_period_days: 3,
      payment_settings: { save_default_payment_method: "on_subscription" }
    });

    const periodEnd = subscription.trial_end ?? subscription.current_period_end;
    if (!periodEnd) {
      // sanity check—this should never happen if Stripe returns one of these
      throw Boom.badImplementation("Could not determine subscription end date");
    }

    const trialEnds = new Date(periodEnd * 1000);

    if (!["trialing", "active"].includes(subscription.status)) {
      // clean up and inform client
      await stripe.subscriptions.del(subscription.id);
      throw Boom.paymentRequired("Subscription setup failed; payment incomplete.");
    }

    // Retrieve from Redis
    const redisData = await redis.get(`temp_user:${stripeCustomerId}`);
    if (!redisData) throw Boom.badImplementation("Registration data expired");
    const userDataFromRedis = JSON.parse(redisData);
    // Create user in database
    const user = new User({
      ...userDataFromRedis,
      subscription: input.plan,
      period: input.period,
      subscribed_At: new Date(),
      tokens: tokens,
      trial_used: true,
      trail_status: 'trialing',
      status: "active",
      nextBillingDate: trialEnds,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId,
    });
    const savedUser = await user.save();

    // Remove from Redis
    await redis.del(`temp_user:${stripeCustomerId}`);

    // Apply discount if used
    if (discountDoc) {
      discountDoc.used_by.push(input.username);
      await discountDoc.save();
    }

    // Create payment record
    const paymentCount = await Payment.countDocuments();
    const uniquePaymentId = `P-${1000 + paymentCount + 1}`;

    await Payment.create({
      user: savedUser._id,
      data: input.plan,
      paymentid: uniquePaymentId,
      payment: discountedPrice || 0,
      discount: discountDoc?.token,
      discountValue,
      tokens: tokens,
      status: "paid",
      period: input.period,
      stripeSubscriptionId: subscription.id,
    });

    // Send verification email
    const frontendUrl = input.frontendUrl || "https://openpreneurs.business";
    const verificationLink = `${frontendUrl}/verify/${verificationToken}`;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: input.email,
      subject: "Verify Your Email",
      html: `
        <p>Welcome to our service!</p>
        <p>Please verify your email by clicking the link below:</p>
        <a href="${verificationLink}">Verify Email</a>
        <p>If you didn't create an account, please ignore this email.</p>
      `
    });

    res.json({
      success: true,
      message: "Registration successful! Check your email for verification.",
      userId: savedUser._id
    });

  } catch (error) {
    // Cleanup on failure
    if (stripeCustomerId) {
      try {
        // Delete Stripe customer
        await stripe.customers.del(stripeCustomerId);
        // Remove from Redis
        await redis.del(`temp_user:${stripeCustomerId}`);
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
    }

    next(Boom.isBoom(error) ? error : Boom.badImplementation(error.message));
  }
};

export const checkDuplicates = async (req, res, next) => {
  try {
    const { email, username } = req.query;

    if (!email && !username) {
      return next(Boom.badRequest("Email or username is required for duplication check."));
    }

    const [emailExists, usernameExists] = await Promise.all([
      email ? User.exists({ email }) : false,
      username ? User.exists({ username }) : false,
    ]);

    res.json({
      success: true,
      emailExists: !!emailExists,
      usernameExists: !!usernameExists,
    });
  } catch (error) {
    next(Boom.badImplementation(error.message));
  }
};

const Login = async (req, res, next) => {
  const input = req.body;
  try {
    const user = await User.findOne({ email: input.email });
    if (!user) {
      return next(Boom.notFound("Email not found."));
    }

    if (user.status === "inactive") {
      return next(Boom.unauthorized("Account has been suspended. Please contact support for more info."));
    }

    const isMatched = await user.isValidPass(input.password);
    if (!isMatched) {
      return next(Boom.unauthorized("Invalid email or password."));
    }

    // If the user is not verified, generate a new verification token and resend email
    if (user.verified === "No") {
      // Generate a new verification token
      const verificationToken = crypto.randomBytes(32).toString("hex");
      user.verificationToken = verificationToken; // Override the previous token
      await user.save();

      // Send the new verification email
      const frontendUrl = input.frontendUrl || "https://openpreneurs.business";
      const verificationLink = `${frontendUrl}/verify/${verificationToken}`;
      const mailOptions = {
        from: "no-reply@openpreneurs.business",
        to: input.email, // Send to user's email
        subject: "Verify Your Email",
        text: `Please click on the following link to verify your email: ${verificationLink}`,
      };
      try {
        await transporter.sendMail(mailOptions);
        return next(
          Boom.unauthorized(
            "Account not verified. A new verification email has been sent to your email address."
          )
        );
      } catch (emailError) {
        return next(
          Boom.badImplementation("Could not send verification email. Please try again later.")
        );
      }
    }

    // 2️⃣ PROFILE COMPLETENESS CHECK
    const required = [
      "profile_pic",
      "display_banner",
      "bio",
      "primary_business",
      "business_country",
      "business_industry",
      "value_chainstake",
      "markets_covered",
      "immediate_needs"
    ];

    const isIncomplete = required.some((field) => {
      const val = user[field];
      if (Array.isArray(val)) {
        return val.length === 0;
      }
      // treat null, undefined, or empty string as missing
      return !val;
    });

    if (isIncomplete) {
      const notificationText = "Your profile isn't complete—please complete it kindly.";
      await Notification.updateOne(
        { user: user._id },
        { $addToSet: { type: "incomplete", data: notificationText } },
        { upsert: true }
      );
    }

    const tokenExpiry = input.rememberMe ? "7d" : "1h"; // 7 days for "Remember Me", 1 hour otherwise

    const accessToken = await signAccessToken({ user_id: user._id, role: user.role }, tokenExpiry);
    const refreshToken = await signRefreshToken(user._id);

    // If the user is verified, proceed with login
    const userData = user.toObject();
    delete userData.password;
    delete userData.__v;

    res.json({ user: userData, accessToken, refreshToken });
  } catch (e) {
    next(e);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const userId = req.params.id;

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return next(Boom.notFound("User not found."));
    }

    res.json({ message: "User deleted successfully." });
  } catch (e) {
    next(e);
  }
};



const RefreshToken = async (req, res, next) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return next(Boom.badRequest("Refresh token missing."));
  }

  try {
    const user_id = await verifyRefreshToken(refresh_token);
    const accessToken = await signAccessToken(user_id);
    const newRefreshToken = await signRefreshToken(user_id);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (e) {
    next(e);
  }
};

const Logout = async (req, res, next) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return next(Boom.badRequest("Refresh token missing."));
  }

  try {
    const user_id = await verifyRefreshToken(refresh_token);

    if (!user_id) {
      return next(Boom.unauthorized("Invalid refresh token."));
    }

    // Correct Redis call
    const result = await redis.del(user_id.toString()); // Ensure it's a string


    res.json({ message: "Logout successful" });
  } catch (e) {
    console.error("Logout error:", e);
    next(e);
  }
};

const updateAddress = async (req, res, next) => {
  const user_id = req.payload?.user_id; // Use optional chaining to safely access user_id
  if (!user_id) {
    return res.status(401).json({ message: "User ID not found in token." }); // Return a response if user_id is not available
  }

  const { address, city, province, postcode, phone } = req.body;

  try {
    // Find the user first to ensure they exist and retrieve the current state of the arrays
    const user = await User.findById(user_id);
    if (!user) {
      return next(Boom.notFound("User not found."));
    }

    // Use the existing values or create empty strings if they do not exist
    const updatedAddress = user.address || [];
    const updatedCity = user.townOrCity || [];
    const updatedState = user.province || [];
    const updatedPostcode = user.postcode || [];
    const updatedPhone = user.phone || [];

    // Ensure the arrays have at least 2 elements (index 0 and 1)
    if (updatedAddress.length < 1) {
      updatedAddress[0] = address; // Set address at index 1
    } else {
      updatedAddress[0] = address; // Update existing index 1
    }

    if (updatedCity.length < 1) {
      updatedCity[0] = city; // Set city at index 1
    } else {
      updatedCity[0] = city; // Update existing index 1
    }

    if (updatedState.length < 1) {
      updatedState[0] = province; // Set state at index 1
    } else {
      updatedState[0] = province; // Update existing index 1
    }

    if (updatedPostcode.length < 1) {
      updatedPostcode[0] = postcode; // Set postcode at index 1
    } else {
      updatedPostcode[0] = postcode; // Update existing index 1
    }

    if (updatedPhone.length < 1) {
      updatedPhone[0] = phone; // Set phone at index 1
    } else {
      updatedPhone[0] = phone; // Update existing index 1
    }

    // Now update the user with the modified arrays
    const updatedUser = await User.findByIdAndUpdate(
      user_id,
      {
        $set: {
          address: updatedAddress,
          townOrCity: updatedCity,
          province: updatedState,
          postcode: updatedPostcode,
          phone: updatedPhone,
        },
      },
      { new: true, runValidators: true }
    );

    res.json(updatedUser);
  } catch (e) {
    next(e);
  }
};

const getAddress = async (req, res, next) => {
  const email = req.query.email;

  if (!email) {
    return res.status(401).json({ message: "Email not found in request." }); // Return an error if email is not provided
  }

  try {
    // Find the user by email to retrieve the address information
    const user = await User.findOne({ email }).select('firstName lastName address townOrCity province postcode phone');
    if (!user) {
      return next(Boom.notFound("User not found.")); // Return error if user is not found
    }
    // Format the response to return the user's address information
    const userAddress = {
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      address: user.address || "",
      city: user.townOrCity || "",
      province: user.province || "",
      postcode: user.postcode || "",
      phone: user.phone || "",
    };

    res.json(userAddress); // Send the user's address data as a response
  } catch (e) {
    next(e); // Pass the error to the next middleware
  }
};


export const Me = async (req, res, next) => {
  const { user_id } = req.payload || {};

  if (!user_id) {
    return res.status(401).json({ message: "Unauthorized: no user ID in token." });
  }

  try {
    // 1️⃣ Try User
    const user = await User.findById(user_id).select("-password -__v");
    if (user) {
      return res.json(user);
    }

    // 2️⃣ Fallback to Admin
    const admin = await Admin.findById(user_id).select("-password -__v");
    if (admin) {
      return res.json(admin);
    }

    // 3️⃣ Not found in either collection
    return res.status(404).json({ message: "No user or admin found with that ID." });
  } catch (err) {
    next(err);
  }
};


const updateUserInfo = async (req, res, next) => {
  try {

    // Extract the user ID from URL params, body, or the authenticated user.
    const userId = req.params.id || req.body.id || req.user?.id;
    console.log(req.body);

    if (!userId) {
      return next(Boom.badRequest("User ID is required."));
    }

    // Fetch the user from the database.
    const user = await User.findById(userId);
    if (!user) {
      return next(Boom.notFound("User not found."));
    }

    // Destructure fields from the request body.
    // Note: For account updates, we expect the field "username" (not displayName).
    const {
      firstName,
      lastName,
      username,      // use this for account update
      aboutme,
      newPassword,
      oldPassword,
      country,
      facebook_link,
      linkedin_link,
      instagram_link,
      x_link,
      web_link,
      business_country,
      business_industry,
      value_chainstake,
      markets_covered,
      immediate_needs,
      primary_business,
      privacy, // Expected from account settings payload
    } = req.body;

    // Upload profile picture if provided.
    let profilePictureUrl = user.profile_pic;

    // Case 1: If frontend sent null (remove profile pic)
    if (req.body.profile_pic === "null" || req.body.profile_pic === null) {
      if (user.profile_pic) {
        try {
          await deleteFromFirebase(user.profile_pic);
        } catch (err) {
          console.warn("Failed to delete old profile picture:", err);
        }
      }
      profilePictureUrl = null;
    }

    // Case 2: If a new profile picture is uploaded
    if (req.files?.profile_pic) {
      if (user.profile_pic) {
        try {
          await deleteFromFirebase(user.profile_pic);
        } catch (err) {
          console.warn("Failed to delete old profile picture:", err);
        }
      }
      profilePictureUrl = await handleFirebaseUpload(
        req.files.profile_pic[0],
        "profile_pic",
        "profile"
      );
    }

    // -------------------- BANNER --------------------

    let bannerUrl = user.display_banner;

    // Case 1: If frontend sent null (remove banner)
    if (req.body.display_banner === "null" || req.body.display_banner === null) {
      if (user.display_banner) {
        try {
          await deleteFromFirebase(user.display_banner);
        } catch (err) {
          console.warn("Failed to delete old banner image:", err);
        }
      }
      bannerUrl = null;
    }

    // Case 2: If a new banner is uploaded
    if (req.files?.banner_image) {
      if (user.display_banner) {
        try {
          await deleteFromFirebase(user.display_banner);
        } catch (err) {
          console.warn("Failed to delete old banner image:", err);
        }
      }
      bannerUrl = await handleFirebaseUpload(
        req.files.banner_image[0],
        "banners",
        "banner"
      );
    }

    // Update user document with new details.
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (username) user.username = username;
    if (country) user.country = country;
    if (aboutme) {
      user.aboutme = aboutme;
    } else {
      user.aboutme = null;
    }

    if (facebook_link) {
      user.facebook_link = facebook_link;
    } else {
      user.facebook_link = null;
    }

    if (linkedin_link) {
      user.linkedin_link = linkedin_link;
    } else {
      user.linkedin_link = null;
    }

    if (instagram_link) {
      user.instagram_link = instagram_link;
    } else {
      user.instagram_link = null;
    }

    if (x_link) {
      user.x_link = x_link;
    } else {
      user.x_link = null;
    }

    if (web_link) {
      user.web_link = web_link;
    } else {
      user.web_link = null;
    }

    if (business_country) {
      user.business_country = business_country;
    } else {
      user.business_country = null;
    }

    if (business_industry) {
      user.business_industry = business_industry;
    } else {
      user.business_industry = null;
    }

    if (value_chainstake) {
      user.value_chainstake = value_chainstake;
    } else {
      user.value_chainstake = null;
    }

    if (markets_covered) {
      user.markets_covered = markets_covered;
    } else {
      user.markets_covered = null;
    }

    if (immediate_needs) {
      user.immediate_needs = immediate_needs;
    } else {
      user.immediate_needs = null;
    }

    if (primary_business) {
      user.primary_business = primary_business;
    } else {
      user.primary_business = null;
    }

    // Update privacy if provided.
    if (privacy) user.privacy = privacy;

    // Update file URLs if the uploads succeeded.
    user.profile_pic = profilePictureUrl;
    user.display_banner = bannerUrl;

    // If a new password is provided, validate and update it.
    if (newPassword) {
      if (!oldPassword) {
        return next(Boom.badRequest("Old password is required to update your password."));
      }
      // Verify that the old password is correct.
      const isMatch = await user.isValidPass(oldPassword);
      if (!isMatch) {
        return next(Boom.unauthorized("Old password is incorrect."));
      }
      // Hash the new password explicitly.
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
    }

    // Save the updated user.
    await user.save();

    res.json({ message: "User information updated successfully.", user });
  } catch (error) {
    next(error);
  }
};


// Helper function to get the date range based on PST
const getDateRangeInPST = (type) => {
  const now = new Date();

  // Adjust for Pakistan Standard Time (UTC+5)
  const utcOffset = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
  const pstNow = new Date(now.getTime() + utcOffset);

  let start, end;

  switch (type) {
    case "today":
      start = new Date(pstNow.setHours(0, 0, 0, 0) - utcOffset);
      end = new Date(pstNow.setHours(23, 59, 59, 999) - utcOffset);
      break;
    case "week":
      const firstDayOfWeek = pstNow.getDate() - pstNow.getDay();
      start = new Date(new Date(pstNow.setDate(firstDayOfWeek)).setHours(0, 0, 0, 0) - utcOffset);
      end = new Date(new Date(pstNow.setDate(firstDayOfWeek + 6)).setHours(23, 59, 59, 999) - utcOffset);
      break;
    case "month":
      start = new Date(new Date(pstNow.getFullYear(), pstNow.getMonth(), 1).setHours(0, 0, 0, 0) - utcOffset);
      end = new Date(new Date(pstNow.getFullYear(), pstNow.getMonth() + 1, 0).setHours(23, 59, 59, 999) - utcOffset);
      break;
    case "year":
      start = new Date(new Date(pstNow.getFullYear(), 0, 1).setHours(0, 0, 0, 0) - utcOffset);
      end = new Date(new Date(pstNow.getFullYear(), 11, 31).setHours(23, 59, 59, 999) - utcOffset);
      break;
    default:
      throw new Error("Invalid type for date range.");
  }

  return { start, end };
};

export const updateUserAdminDetails = async (req, res, next) => {
  try {
    const { userId } = req.params; // Extract userId from request params
    const { tokens, subscription, role, status, level, period } = req.body; // Data to update

    // Validate user input (Optional)
    const validSubscriptions = ["none", "basic", "premium"];
    const validRoles = ["user", "admin"];
    const validStatuses = ["active", "inactive", "suspended"];
    const validLevels = ["super", "admin", "moderator"];

    if (subscription && !validSubscriptions.includes(subscription)) {
      return next(Boom.badRequest("Invalid subscription type."));
    }
    if (role && !validRoles.includes(role)) {
      return next(Boom.badRequest("Invalid role."));
    }
    if (status && !validStatuses.includes(status)) {
      return next(Boom.badRequest("Invalid status."));
    }
    if (level && !validLevels.includes(level)) {
      return next(Boom.badRequest("Invalid level."));
    }

    // Build dynamic update object
    const updateData = {};
    if (tokens !== undefined) updateData.tokens = tokens;
    updateData.subscription = subscription;

    if (subscription === "none") {
      updateData.period = "none"; // Set period to "none" if subscription is "none".
      updateData.nextBillingDate = null; // Set nextBillingDate to null if subscription is "none".
    } else {
      updateData.period = period; // Set the period based on user input.

      // Calculate nextBillingDate based on the period.
      const today = new Date();
      let nextBillingDate;

      if (period === "month") {
        nextBillingDate = new Date(today.setMonth(today.getMonth() + 1)); // Set to next month.
      } else if (period === "year") {
        nextBillingDate = new Date(today.setFullYear(today.getFullYear() + 1)); // Set to next year.
      }

      updateData.nextBillingDate = nextBillingDate;
    }
    if (role) updateData.role = role;
    if (status) updateData.status = status;
    if (level) updateData.level = level;

    // Update the user and return the updated document
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true, // Return the updated document
      runValidators: true, // Ensure Mongoose schema validations run
    });

    if (!updatedUser) {
      return next(Boom.notFound("User not found."));
    }

    res.status(200).json({
      success: true,
      message: "User updated successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    next(Boom.internal("Error updating user."));
  }
};

export const getAllAdminUsers = async (req, res, next) => {
  try {
    // Extract optional query parameters for filtering
    const { role, status, subscription, limit = 50, page = 1 } = req.query;

    // Build dynamic query object
    const query = {};
    if (role) query.role = role;
    if (status) query.status = status;
    if (subscription) query.subscription = subscription;

    // Pagination: Calculate skip value
    const skip = (page - 1) * limit;

    // Fetch users with filtering and pagination
    const users = await User.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .select("-password -resetPasswordToken -resetPasswordExpires") // Exclude sensitive fields
      .populate("joined_tribes", "name") // Populate joined_tribes (optional)
      .populate("mytribers", "username email") // Populate mytribers (optional)
      .populate("chat_lobby", "name"); // Populate chat_lobby (optional)

    // Get total count for pagination metadata
    const totalUsers = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      totalUsers,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalUsers / limit),
      users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    next(Boom.internal("Error fetching users."));
  }
};

// Function to get the total number of registrations based on the date range
const GetTotalNumberOfRegistrationsByDateRange = async (req, res, next) => {
  const { rangeType } = req.params; // e.g., 'today', 'week', 'month', 'year'

  try {
    const { start, end } = getDateRangeInPST(rangeType);

    // Count the number of registrations based on the 'createdAt' field
    const totalRegistrationsCount = await User.countDocuments({
      createdAt: { $gte: start, $lte: end },
    });

    res.json({
      range: rangeType,
      totalRegistrations: totalRegistrationsCount,
    });
  } catch (e) {
    next(e);
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().select("-password -__v"); // Exclude sensitive fields
    res.json(users);
  } catch (e) {
    next(e);
  }
};

import ChatLobby from "../../models/chatlobby.js";
import { v4 as uuidv4 } from "uuid";

// Returns an existing chat lobby ID if one exists between the two users,
// otherwise creates a new chat lobby and returns its ID.
const getOrCreateChatLobby = async (req, res, next) => {
  try {
    const { userId1, userId2 } = req.body;
    if (!userId1 || !userId2) {
      return res.status(400).json({ message: "Both user IDs are required." });
    }
    // Find if a chat lobby exists between these users
    const existingLobby = await ChatLobby.findOne({
      participants: { $all: [userId1, userId2] }
    }).populate("participants", "username profile_pic firstName lastName");

    if (existingLobby) {
      return res.status(200).json({ chatLobbyId: existingLobby.chatLobbyId });
    }

  } catch (error) {
    next(error);
  }
};

const getOrCreateChatLobbyTribe = async (req, res, next) => {
  try {
    const { userIds } = req.body; // expecting an array like [user1, user2, user3, ...]

    if (!userIds || !Array.isArray(userIds) || userIds.length < 2) {
      return res.status(400).json({ message: "At least two user IDs are required." });
    }

    // Step 1: Try to find an existing lobby with the same exact participants
    const existingLobby = await ChatLobby.findOne({
      participants: { $all: userIds, $size: userIds.length }
    }).populate("participants", "username profile_pic firstName lastName");

    if (existingLobby) {
      return res.status(200).json({ chatLobbyId: existingLobby.chatLobbyId, lobby: existingLobby });
    }

    // Step 2: If not found, create a new chat lobby
    const newLobby = new ChatLobby({
      participants: userIds
    });

    await newLobby.save();

    // Optionally populate users for response
    await newLobby.populate("participants", "username profile_pic firstName lastName");

    return res.status(201).json({ chatLobbyId: newLobby.chatLobbyId, lobby: newLobby });

  } catch (error) {
    next(error);
  }
};


// Get all chat lobbies for the current authenticated user
const getUserChatLobbies = async (req, res, next) => {
  try {
    const userId = req.payload.user_id; // Provided by verifyAccessToken middleware

    const chatLobbies = await ChatLobby.find({
      participants: userId,
      deletefor: { $ne: userId } // Exclude lobbies where userId is in deletefor
    }).populate({
      path: "participants",
      select: "username profile_pic firstName lastName"
    });

    return res.json(chatLobbies);
  } catch (error) {
    next(error);
  }
};

const createChatLobby = async (req, res, next) => {
  try {
    const { userId1, userId2 } = req.body;
    if (!userId1 || !userId2) {
      return res.status(400).json({ message: "Both user IDs are required." });
    }

    // Check if a chat lobby already exists between these two users.
    let existingLobby = await ChatLobby.findOne({
      participants: { $all: [userId1, userId2] }
    });

    if (existingLobby) {
      // If userId1 is in the deletefor array, remove it.
      if (existingLobby.deletefor.includes(userId1)) {
        existingLobby.deletefor = existingLobby.deletefor.filter(
          (id) => id.toString() !== userId1
        );
      }
      // Similarly, if userId2 is in the deletefor array, remove it.
      if (existingLobby.deletefor.includes(userId2)) {
        existingLobby.deletefor = existingLobby.deletefor.filter(
          (id) => id.toString() !== userId2
        );
      }
      await existingLobby.save();
      return res.status(200).json({ chatLobbyId: existingLobby.chatLobbyId });
    }

    // Otherwise, create a new chat lobby.
    const newChatLobbyId = uuidv4();
    const newChatLobby = new ChatLobby({
      chatLobbyId: newChatLobbyId,
      participants: [userId1, userId2],
      messages: [],
      deletefor: [] // Initialize as an empty array
    });

    await newChatLobby.save();
    return res.status(201).json({ chatLobbyId: newChatLobbyId });
  } catch (error) {
    next(error);
  }
};

const forwardMessage = async (req, res, next) => {
  try {
    console.log(req.body);
    const { userId1, userId2, messageContent } = req.body;

    if (!userId1 || !userId2 || !messageContent) {
      return res.status(400).json({ message: "User IDs and message content are required." });
    }

    // Find existing lobby
    let existingLobby = await ChatLobby.findOne({
      participants: { $all: [userId1, userId2] }
    });

    const chatLobbyId = existingLobby ? existingLobby.chatLobbyId : uuidv4();

    // Create a new forwarded message
    const newMessage = await Message.create({
      chatLobbyId,
      sender: new mongoose.Types.ObjectId(userId1),
      message: messageContent,
      forward: true,
      type: 'text'
    });

    // Log the new message to ensure it's properly created
    console.log("New Forwarded Message Created:", newMessage);

    if (existingLobby) {
      // Update the last message and message ID in the existing lobby
      existingLobby.lastmsg = "Forwarded"; // Set the last message to the forwarded message content
      existingLobby.lastmsgid = newMessage._id; // Set the last message ID to the forwarded message's ID
      existingLobby.messages.push(newMessage); // Push the new forwarded message

      existingLobby.lastUpdated = Date.now();
      await existingLobby.save();

      return res.status(200).json({
        chatLobbyId: existingLobby.chatLobbyId,
        message: 'Message forwarded to existing lobby and updated as the last message.'
      });
    }

    // Otherwise, create a new lobby
    const newChatLobby = new ChatLobby({
      chatLobbyId,
      participants: [userId1, userId2],
      messages: [newMessage], // Add the new message to the messages array
      lastmsg: "Forwarded",
      lastmsgid: newMessage._id,
      deletefor: []
    });

    await newChatLobby.save();

    return res.status(201).json({
      chatLobbyId,
      message: 'Message sent in a new lobby and set as the last message.'
    });

  } catch (error) {
    next(error);
  }
};





import Message from "../../models/Message.js";

async function flushChatBuffer(room) {
  const key = `chat:buffer:${room}`;
  const items = await redis.lrange(key, 0, -1);
  if (!items.length) return;

  const docs = items.map((raw) => {
    const p = JSON.parse(raw);
    return {
      chatLobbyId: room,
      sender: new mongoose.Types.ObjectId(p.senderId),
      message: p.text,
      type: 'text',
      seen: false,
      sentAt: new Date(p.timestamp),
    };
  });

  try {
    await Message.insertMany(docs);
    // clear deletefor once per batch
    await ChatLobby.findOneAndUpdate(
      { chatLobbyId: room },
      { $set: { deletefor: [] } }
    );
  } catch (err) {
    console.error('Error bulk‐inserting chat buffer for room', room, err);
    // leave the buffer intact for retry
    return;
  }

  await redis.del(key);
}

export const getChatMessages = async (req, res, next) => {
  try {
    const { chatLobbyId } = req.params;
    const userId = req.query.userId || req.payload?.user_id;
    const page = parseInt(req.query.page, 10) || 0;
    const PAGE_SIZE = 20;

    if (!chatLobbyId) {
      return res.status(400).json({ message: "Chat Lobby ID is required." });
    }

    // 1. Flush the buffered messages from Redis to MongoDB
    await flushChatBuffer(chatLobbyId);

    // 2. Fetch the chat messages from MongoDB
    const docs = await Message.find({
      chatLobbyId,
      deletedFor: { $ne: userId },
    })
      .sort({ sentAt: -1 })
      .skip(page * PAGE_SIZE)
      .limit(PAGE_SIZE + 1)
      .populate("sender", "username")
      .lean();

    // 3. If we got more than PAGE_SIZE, there's another page
    const hasMore = docs.length > PAGE_SIZE;
    // Trim off the extra record, then reverse so client sees oldest→newest order
    const messages = docs.slice(0, PAGE_SIZE).reverse();

    return res.json({ messages, hasMore });
  } catch (error) {
    next(error);
  }
};


export const deleteChatLobbyForUser = async (req, res, next) => {
  try {
    const userId = req.payload.user_id; // current authenticated user id
    const { chatLobbyId } = req.params; // assuming chatLobbyId is passed as a URL parameter

    if (!chatLobbyId) {
      return res.status(400).json({ message: "Chat lobby ID is required." });
    }

    // Find all messages for this chat lobby.
    const messages = await Message.find({ chatLobbyId });

    // If there are no messages, return a success response.
    if (!messages || messages.length === 0) {
      return res.status(200).json({ message: "No messages found in this chat lobby." });
    }

    // Loop over each message to update or delete it.
    for (const message of messages) {
      // Ensure that the deletedFor field exists and is an array.
      if (!Array.isArray(message.deletedFor)) {
        message.deletedFor = [];
      }

      // If the current user hasn't already "deleted" this message, add their ID.
      if (!message.deletedFor.includes(userId)) {
        message.deletedFor.push(userId);
      }

      // Check if both participants have deleted this message.
      // (Assuming a two-user chat, so length of deletedFor being 2 means both users have deleted it.)
      if (message.deletedFor.length >= 2) {
        // If the message is a file message and has a fileUrl, delete the file from Firebase.
        if (message.type === "file" && message.fileUrl) {
          try {
            await deleteFromFirebase(message.fileUrl);
          } catch (firebaseError) {
            console.error("Error deleting file from Firebase:", firebaseError);
            // Optionally, decide whether to continue or return an error here.
          }
        }
        // Permanently remove the message from the database.
        await Message.deleteOne({ _id: message._id });
      } else {
        // Otherwise, save the updated message (with the new deletedFor array).
        await message.save();
      }
    }

    return res.status(200).json({ message: "Chat lobby deleted for user successfully." });
  } catch (error) {
    next(error);
  }
};


/**
 * Send a friend request.
 * Adds the current user's ID (from req.user) to the target user's 'requests' array.
 */
export const sendFriendRequest = async (req, res, next) => {
  try {
    // Extract both targetUserId and currentUserId from the request body.
    const { targetUserId, currentUserId } = req.body;
    if (!targetUserId || !currentUserId) {
      return next(Boom.badRequest("Target user ID and current user ID are required."));
    }

    // Add currentUserId to the target user's 'requests' array.
    const targetUser = await User.findByIdAndUpdate(
      targetUserId,
      { $addToSet: { requests: currentUserId } },
      { new: true }
    );
    if (!targetUser) {
      return next(Boom.notFound("Target user not found."));
    }

    // Also, add targetUserId to the current user's 'sentrequests' array.
    await User.findByIdAndUpdate(
      currentUserId,
      { $addToSet: { sentrequests: targetUserId } },
      { new: true }
    );

    // --- Notification Logic for Friend Request ---
    // To display a meaningful message, look up the current user's details.
    const currentUser = await User.findById(currentUserId);
    const notificationText = `You have a new triber request from ${currentUser ? currentUser.username : 'someone'}`;
    await Notification.updateOne(
      { user: targetUserId },
      { $addToSet: { type: "friendrequest", data: notificationText } },
      { upsert: true }
    );
    // --- End Notification Logic ---

    res.status(200).json({
      success: true,
      message: "Triber request sent successfully.",
      data: targetUser,
    });
  } catch (error) {
    console.error("Error sending triber request:", error);
    next(Boom.internal("Error sending triber request."));
  }
};



/**
 * Accept a friend request.
 * Removes the requester ID from the current user's "requests" array,
 * and from the requester's "sentrequests" array,
 * and adds them mutually to the "mytribers" array.
 */
export const acceptFriendRequest = async (req, res, next) => {
  try {
    const { targetUserId, currentUserId } = req.body;
    const requesterId = targetUserId;
    if (!requesterId || !currentUserId) {
      return next(Boom.badRequest("Requester ID and current user ID are required."));
    }

    // Remove the requester from the current user's "requests" array and add to "mytribers".
    const currentUser = await User.findByIdAndUpdate(
      currentUserId,
      {
        $pull: { requests: requesterId },
        $addToSet: { mytribers: requesterId },
      },
      { new: true }
    );
    if (!currentUser) {
      return next(Boom.notFound("Current user not found."));
    }

    // Also, remove the current user from the requester's "sentrequests" and add to the requester's "mytribers".
    await User.findByIdAndUpdate(
      requesterId,
      {
        $pull: { sentrequests: currentUserId },
        $addToSet: { mytribers: currentUserId },
      },
      { new: true }
    );

    // --- Notification Logic for Friend Request Acceptance ---
    // Notify the requester (sender) that the friend request has been accepted.
    const notificationText = `Your triber request has been accepted by ${currentUser.username}`;
    await Notification.updateOne(
      { user: requesterId },
      { $addToSet: { type: "acceptrequest", data: notificationText } },
      { upsert: true }
    );
    // --- End Notification Logic ---

    res.status(200).json({
      success: true,
      message: "Triber request accepted successfully.",
      data: currentUser,
    });
  } catch (error) {
    console.error("Error accepting triber request:", error);
    next(Boom.internal("Error accepting triber request."));
  }
};


/**
 * Reject a friend request.
 * Removes the requester ID from the current user's "requests" array,
 * removes the current user's ID from the requester's "sentrequests" array,
 * and adds the requester ID to the current user's "rejectedrequests" array.
 */
export const rejectFriendRequest = async (req, res, next) => {
  try {
    const { targetUserId, currentUserId } = req.body; // the user who sent the friend request
    const requesterId = targetUserId;
    if (!requesterId || !currentUserId) {
      return next(Boom.badRequest("Requester ID and current user ID are required."));
    }

    // Remove the requester from current user's "requests" array and add to "rejectedrequests".
    const currentUser = await User.findByIdAndUpdate(
      currentUserId,
      {
        $pull: { requests: requesterId },
        $addToSet: { rejectedrequests: requesterId },
      },
      { new: true }
    );
    if (!currentUser) {
      return next(Boom.notFound("Current user not found."));
    }

    // Also, remove the current user from requester's "sentrequests" array.
    await User.findByIdAndUpdate(
      requesterId,
      { $pull: { sentrequests: currentUserId } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Triber request rejected successfully.",
      data: currentUser,
    });
  } catch (error) {
    console.error("Error rejecting triber request:", error);
    next(Boom.internal("Error rejecting triber request."));
  }
};

/**
 * Block a user.
 * Adds the target user's ID to the current user's 'blockedtribers' array,
 * and adds the current user's ID to the target user's 'blockedby' array.
 */
export const blockUser = async (req, res, next) => {
  try {
    const { targetUserId, currentUserId } = req.body;
    if (!targetUserId || !currentUserId) {
      return next(Boom.badRequest("Target user ID and current user ID are required."));
    }

    // Update current user's blockedtribers.
    const currentUser = await User.findByIdAndUpdate(
      currentUserId,
      { $addToSet: { blockedtribers: targetUserId } },
      { new: true }
    );
    // Update target user's blockedby.
    await User.findByIdAndUpdate(
      targetUserId,
      { $addToSet: { blockedby: currentUserId } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "User blocked successfully.",
      data: currentUser,
    });
  } catch (error) {
    console.error("Error blocking user:", error);
    next(Boom.internal("Error blocking user."));
  }
};

/**
 * Unblock a user.
 * Removes the target user's ID from the current user's 'blockedtribers' array,
 * and removes the current user's ID from the target user's 'blockedby' array.
 */
export const unblockUser = async (req, res, next) => {
  try {
    const { targetUserId, currentUserId } = req.body;
    if (!targetUserId || !currentUserId) {
      return next(Boom.badRequest("Target user ID and current user ID are required."));
    }

    // Update current user's blockedtribers.
    const currentUser = await User.findByIdAndUpdate(
      currentUserId,
      { $pull: { blockedtribers: targetUserId } },
      { new: true }
    );
    // Update target user's blockedby.
    await User.findByIdAndUpdate(
      targetUserId,
      { $pull: { blockedby: currentUserId } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "User unblocked successfully.",
      data: currentUser,
    });
  } catch (error) {
    console.error("Error unblocking user:", error);
    next(Boom.internal("Error unblocking user."));
  }
};

export const removeFriend = async (req, res, next) => {
  try {
    const { friendId, currentUserId } = req.body;

    if (!friendId || !currentUserId) {
      return next(Boom.badRequest("Triber ID and current user ID are required."));
    }

    // Remove friendId from current user's mytribers array.
    const currentUser = await User.findByIdAndUpdate(
      currentUserId,
      { $pull: { mytribers: friendId } },
      { new: true }
    );

    if (!currentUser) {
      return next(Boom.notFound("Current user not found."));
    }

    // Optionally, remove currentUserId from the friend's mytribers array.
    await User.findByIdAndUpdate(
      friendId,
      { $pull: { mytribers: currentUserId } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Triber removed successfully.",
      data: currentUser,
    });
  } catch (error) {
    console.error("Error removing friend:", error);
    next(Boom.internal("Error removing friend."));
  }
};

export const cancelSentFriendRequest = async (req, res, next) => {
  try {
    const { targetUserId } = req.body; // the user to whom the request was sent
    const currentUserId = req.user && (req.user._id || req.user.id);

    if (!targetUserId || !currentUserId) {
      return next(Boom.badRequest("Target user ID and current user ID are required."));
    }

    // Remove targetUserId from current user's sentrequests.
    const sender = await User.findByIdAndUpdate(
      currentUserId,
      { $pull: { sentrequests: targetUserId } },
      { new: true }
    );

    // Remove currentUserId from target user's requests.
    const targetUser = await User.findByIdAndUpdate(
      targetUserId,
      { $pull: { requests: currentUserId } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Sent triber request cancelled successfully.",
      data: sender,
    });
  } catch (error) {
    console.error("Error cancelling sent friend request:", error);
    next(Boom.internal("Error cancelling sent friend request."));
  }
};

/**
 * Remove a rejected friend request.
 * Removes the specified requester ID from the current user's 'rejectedrequests' array.
 */
export const removeRejectedFriendRequest = async (req, res, next) => {
  try {
    const { requesterId } = req.body; // the user whose friend request was rejected and is recorded in rejectedrequests
    const currentUserId = req.user && (req.user._id || req.user.id);

    if (!requesterId || !currentUserId) {
      return next(Boom.badRequest("Requester ID and current user ID are required."));
    }

    const currentUser = await User.findByIdAndUpdate(
      currentUserId,
      { $pull: { rejectedrequests: requesterId } },
      { new: true }
    );

    if (!currentUser) {
      return next(Boom.notFound("Current user not found."));
    }

    res.status(200).json({
      success: true,
      message: "Rejected triber request removed successfully.",
      data: currentUser,
    });
  } catch (error) {
    console.error("Error removing rejected friend request:", error);
    next(Boom.internal("Error removing rejected friend request."));
  }
};

export const updateUsername = async (req, res, next) => {
  try {
    // Retrieve the current user's ID from the JWT payload.
    const userId = req.payload?.user_id;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const { newUsername } = req.body;
    if (!newUsername) {
      return next(Boom.badRequest("New username is required."));
    }

    // Check if the new username already exists for another user.
    const existingUser = await User.findOne({ username: newUsername });
    if (existingUser && existingUser._id.toString() !== userId.toString()) {
      return next(Boom.conflict("Username already exists. Please choose another."));
    }

    // Update the user's username.
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { username: newUsername },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return next(Boom.notFound("User not found."));
    }

    res.status(200).json({
      success: true,
      message: "Username updated successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating username:", error);
    next(Boom.internal("Error updating username."));
  }
};

export const updateUserPassword = async (req, res, next) => {
  // Extract user_id from the JWT token payload
  const user_id = req.payload?.user_id;
  if (!user_id) {
    return res.status(401).json({ message: "User ID not found in token." });
  }

  const { newPassword } = req.body;
  if (!newPassword) {
    return res.status(400).json({ message: "New password is required." });
  }

  try {
    // Find the user by ID
    const user = await User.findById(user_id);
    if (!user) {
      return next(Boom.notFound("User not found."));
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedPassword;

    // Save the updated user
    const updatedUser = await user.save();
    res.json({ message: "Password updated successfully.", user: updatedUser });
  } catch (error) {
    console.error("Error updating password:", error);
    next(Boom.internal("Error updating password."));
  }
};

export const updateUserProfile = async (req, res, next) => {
  try {
    // Extract user ID from the JWT payload (adjust according to your authentication middleware)
    const userId = req.payload?.user_id;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    // Destructure the fields from req.body
    const {
      title,
      shortintro,
      firstName,
      lastName,
      country,
      gender,
      business_country,
      business_industry,
      value_chainstake,
      markets_covered,
      immediate_needs,
      phone,
      primary_business,
      facebook_link,
      linkedin_link,
      instagram_link,
      x_link,
      web_link,
      aboutme,
    } = req.body;

    // Build the update object. You can remove keys with undefined values if needed.
    const updateData = {
      title,
      shortintro,
      firstName,
      lastName,
      country,
      gender,
      business_country,
      business_industry,
      value_chainstake,
      markets_covered,
      immediate_needs,
      phone,
      primary_business,
      facebook_link,
      linkedin_link,
      instagram_link,
      x_link,
      web_link,
      aboutme,
    };

    // Optionally remove undefined keys
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Update the user document
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    });
    if (!updatedUser) {
      return next(Boom.notFound("User not found."));
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    next(Boom.internal("Error updating profile."));
  }
};

export const removeUserBanner = async (req, res, next) => {
  try {
    const userId = req.payload?.user_id; // Get user ID from JWT payload
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(Boom.notFound("User not found."));
    }

    if (!user.display_banner) {
      return res.status(400).json({ message: "No banner to remove." });
    }

    // Delete banner from Firebase Storage
    await deleteFromFirebase(user.display_banner);

    // Update user document by setting display_banner to null
    user.display_banner = null;
    const updatedUser = await user.save();

    res.status(200).json({
      success: true,
      message: "Banner removed successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error removing banner:", error);
    next(Boom.internal("Error removing banner."));
  }
};

/**
 * Remove the user's profile picture.
 */
export const removeUserProfilePic = async (req, res, next) => {
  try {
    const userId = req.payload?.user_id; // Get user ID from JWT payload
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(Boom.notFound("User not found."));
    }

    if (!user.profile_pic) {
      return res.status(400).json({ message: "No profile picture to remove." });
    }

    // Delete profile picture from Firebase Storage
    await deleteFromFirebase(user.profile_pic);

    // Update user document by setting profile_pic to null
    user.profile_pic = null;
    const updatedUser = await user.save();

    res.status(200).json({
      success: true,
      message: "Profile picture removed successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error removing profile picture:", error);
    next(Boom.internal("Error removing profile picture."));
  }
};

export const updateUserMedia = async (req, res, next) => {
  try {
    // Get user ID from JWT payload
    const userId = req.payload?.user_id;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    let profilePicUrl, bannerUrl;
    // Upload profile picture if provided.
    if (req.files && req.files["profile_pic"]) {
      profilePicUrl = await handleFirebaseUpload(
        req.files["profile_pic"][0],
        "DisplayPhoto", // Folder for profile pics
        `User-${userId}-profile`
      );
    }
    // Upload banner if provided.
    if (req.files && req.files["display_banner"]) {
      bannerUrl = await handleFirebaseUpload(
        req.files["display_banner"][0],
        "DisplayBanner", // Ensure your firebase deletion method allows "DisplayBanner/"
        `User-${userId}-banner`
      );
    }

    const updateData = {};
    if (profilePicUrl) updateData.profile_pic = profilePicUrl;
    if (bannerUrl) updateData.display_banner = bannerUrl;

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });
    if (!updatedUser) {
      return next(Boom.notFound("User not found."));
    }

    res.status(200).json({
      success: true,
      message: "User media updated successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user media:", error);
    next(Boom.internal("Error updating user media."));
  }
};

export const joinTribe = async (req, res, next) => {
  try {
    const userId = req.payload?.user_id;
    const { tribeId } = req.body;
    if (!userId || !tribeId) {
      return next(Boom.badRequest("User ID and Tribe ID are required."));
    }

    // Fetch tribe details
    const tribe = await Mytribe.findById(tribeId);
    if (!tribe) return next(Boom.notFound("Tribe not found."));

    // Check if user is blocked from this tribe
    if (tribe.blockedUsers && tribe.blockedUsers.some(id => id.toString() === userId.toString())) {
      return next(Boom.forbidden("You are blocked from joining this tribe."));
    }

    // Check member limit if defined (>0)
    if (tribe.membersLimit > 0 && tribe.members.length >= tribe.membersLimit) {
      return next(Boom.badRequest("Member limit reached for this tribe."));
    }

    if (tribe.joinPolicy === "open") {
      // Direct join: update user's joined_tribes and tribe's members.
      const userUpdatePromise = User.findByIdAndUpdate(
        userId,
        { $addToSet: { joined_tribes: tribeId } },
        { new: true }
      );
      const tribeUpdatePromise = Mytribe.findByIdAndUpdate(
        tribeId,
        { $addToSet: { members: userId } },
        { new: true }
      );
      const [updatedUser, updatedTribe] = await Promise.all([userUpdatePromise, tribeUpdatePromise]);
      if (!updatedUser) return next(Boom.notFound("User not found."));
      if (!updatedTribe) return next(Boom.notFound("Tribe not found."));
      return res.status(200).json({
        success: true,
        message: "Joined tribe successfully.",
        data: { user: updatedUser, tribe: updatedTribe },
      });
    } else {
      // Closed tribe: add join request.
      // Initialize requests array if not present.
      if (!tribe.requests) tribe.requests = [];
      // Check if already requested.
      if (tribe.requests.some(id => id.toString() === userId.toString())) {
        return next(Boom.badRequest("Join request already sent."));
      }
      tribe.requests.push(userId);
      const updatedTribe = await tribe.save();
      return res.status(200).json({
        success: true,
        message: "Join request sent. Awaiting admin approval.",
        data: updatedTribe,
      });
    }
  } catch (error) {
    console.error("Error joining tribe:", error);
    next(Boom.internal("Error joining tribe."));
  }
};

export const kickUserFromTribe = async (req, res, next) => {
  try {
    const adminId = req.payload?.user_id;
    const { tribeId, targetUserId } = req.body;

    if (!adminId || !tribeId || !targetUserId) {
      return next(Boom.badRequest("Tribe ID, target user ID and admin user ID are required."));
    }

    // Fetch the tribe.
    const tribe = await Mytribe.findById(tribeId);
    if (!tribe) return next(Boom.notFound("Tribe not found."));

    // Verify that the current user is an admin of the tribe.
    if (!tribe.admins.some(id => id.toString() === adminId.toString())) {
      return next(Boom.forbidden("Only tribe admins can kick users."));
    }

    // Remove the target user from the tribe's members.
    const updatedTribe = await Mytribe.findByIdAndUpdate(
      tribeId,
      { $pull: { members: targetUserId } },
      { new: true }
    );

    // Also remove the tribe from the target user's joined_tribes.
    await User.findByIdAndUpdate(
      targetUserId,
      { $pull: { joined_tribes: tribeId } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "User kicked from tribe successfully.",
      data: updatedTribe,
    });
  } catch (error) {
    console.error("Error kicking user from tribe:", error);
    next(Boom.internal("Error kicking user from tribe."));
  }
};

/**
 * Get all members of a tribe.
 * Expects the tribe ID as a route parameter.
 * Populates the 'members' field with basic information.
 */
export const getTribeMembers = async (req, res, next) => {
  try {
    const { tribeId } = req.params;
    if (!tribeId) {
      return next(Boom.badRequest("Tribe ID is required."));
    }
    const tribe = await Mytribe.findById(tribeId).populate("members", "username profile_pic");
    if (!tribe) return next(Boom.notFound("Tribe not found."));
    res.status(200).json({
      success: true,
      members: tribe.members,
    });
  } catch (error) {
    console.error("Error fetching tribe members:", error);
    next(Boom.internal("Error fetching tribe members."));
  }
};


/**
 * Leave a tribe.
 * Removes tribeId from the user's joined_tribes array and removes userId from the tribe's members array.
 */
export const leaveTribe = async (req, res, next) => {
  try {
    const userId = req.payload?.user_id;
    const { tribeId } = req.body;
    if (!userId || !tribeId) {
      return next(Boom.badRequest("User ID and Tribe ID are required."));
    }
    const userUpdatePromise = User.findByIdAndUpdate(
      userId,
      { $pull: { joined_tribes: tribeId } },
      { new: true }
    );
    const tribeUpdatePromise = Mytribe.findByIdAndUpdate(
      tribeId,
      { $pull: { members: userId } },
      { new: true }
    );
    const [updatedUser, updatedTribe] = await Promise.all([userUpdatePromise, tribeUpdatePromise]);
    if (!updatedUser) return next(Boom.notFound("User not found."));
    if (!updatedTribe) return next(Boom.notFound("Tribe not found."));
    res.status(200).json({
      success: true,
      message: "Left tribe successfully.",
      data: { user: updatedUser, tribe: updatedTribe },
    });
  } catch (error) {
    console.error("Error leaving tribe:", error);
    next(Boom.internal("Error leaving tribe."));
  }
};

const deleteChatForUser = async (req, res, next) => {
  try {
    const userId = req.body.userId || req.payload.user_id;
    const { chatLobbyId } = req.body;
    if (!chatLobbyId) {
      return res.status(400).json({ error: "chatLobbyId is required" });
    }
    // Update the ChatLobby document:
    const updatedLobby = await ChatLobby.findOneAndUpdate(
      { chatLobbyId: chatLobbyId },
      { $addToSet: { deletefor: userId } },
      { new: true }
    );

    if (!updatedLobby) {
      return res.status(404).json({ error: "Chat lobby not found" });
    }

    // Update all Message documents:
    await Message.updateMany(
      { chatLobbyId: chatLobbyId },
      { $addToSet: { deletedFor: userId } }
    );
    return res.json({
      updatedLobby,
      message: "Chat lobby and its messages have been deleted for the current user."
    });
  } catch (error) {
    console.error("Error in deleteChatForUser:", error);
    next(error);  // This will send the 500 response with the error message
  }
};


/**
 * Accept a tribe join request.
 * Tribe admin accepts a user's join request: removes the user from the tribe's requests array,
 * and if member limit is not exceeded, adds the user to the tribe's members array and updates the user's joined_tribes.
 */
export const acceptTribeRequest = async (req, res, next) => {
  try {
    const adminUserId = req.payload?.user_id;
    const { tribeId, requesterId } = req.body;
    if (!adminUserId || !tribeId || !requesterId) {
      return next(Boom.badRequest("Tribe ID, requester ID, and admin user ID are required."));
    }

    const tribe = await Mytribe.findById(tribeId);
    if (!tribe) return next(Boom.notFound("Tribe not found."));

    // Ensure current user is an admin of this tribe.
    if (!tribe.admins.includes(adminUserId)) {
      return next(Boom.forbidden("Only tribe admins can accept join requests."));
    }

    // Check if member limit is reached.
    if (tribe.membersLimit > 0 && tribe.members.length >= tribe.membersLimit) {
      return next(Boom.badRequest("Member limit reached for this tribe."));
    }

    // Verify that the requester is in the tribe's requests array.
    if (!tribe.requests.includes(requesterId)) {
      return next(Boom.badRequest("No such join request exists."));
    }

    tribe.requests.pull(requesterId);
    tribe.members.push(requesterId);
    const updatedTribe = await tribe.save();

    // Also update the requester user's joined_tribes array.
    const updatedUser = await User.findByIdAndUpdate(
      requesterId,
      { $addToSet: { joined_tribes: tribeId } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Tribe join request accepted.",
      data: { tribe: updatedTribe, user: updatedUser },
    });
  } catch (error) {
    console.error("Error accepting tribe request:", error);
    next(Boom.internal("Error accepting tribe request."));
  }
};

/**
 * Reject a tribe join request.
 * Tribe admin rejects a user's join request by removing the user from the tribe's requests array.
 */
export const rejectTribeRequest = async (req, res, next) => {
  try {
    const adminUserId = req.payload?.user_id;
    const { tribeId, requesterId } = req.body;
    if (!adminUserId || !tribeId || !requesterId) {
      return next(Boom.badRequest("Tribe ID, requester ID, and admin user ID are required."));
    }

    const tribe = await Mytribe.findById(tribeId);
    if (!tribe) return next(Boom.notFound("Tribe not found."));

    // Ensure current user is an admin of this tribe.
    if (!tribe.admins.includes(adminUserId)) {
      return next(Boom.forbidden("Only tribe admins can reject join requests."));
    }

    if (!tribe.requests.includes(requesterId)) {
      return next(Boom.badRequest("No such join request exists."));
    }

    tribe.requests.pull(requesterId);
    const updatedTribe = await tribe.save();

    res.status(200).json({
      success: true,
      message: "Tribe join request rejected.",
      data: updatedTribe,
    });
  } catch (error) {
    console.error("Error rejecting tribe request:", error);
    next(Boom.internal("Error rejecting tribe request."));
  }
};

/**
 * Add a course to the user's courses array.
 */
export const addCourse = async (req, res, next) => {
  try {
    const userId = req.payload?.user_id;
    const { courseId } = req.body;
    if (!userId || !courseId) {
      return next(Boom.badRequest("User ID and Course ID are required."));
    }
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { courses: courseId } },
      { new: true }
    );
    if (!updatedUser) return next(Boom.notFound("User not found."));
    res.status(200).json({
      success: true,
      message: "Course added successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error adding course:", error);
    next(Boom.internal("Error adding course."));
  }
};

export const toggleEmailVisibility = async (req, res, next) => {
  try {
    const userId = req.payload?.user_id;
    if (!userId) return next(Boom.unauthorized("User not authenticated."));

    // Flip the email_visibility value
    const user = await User.findById(userId);
    if (!user) return next(Boom.notFound("User not found."));

    user.email_visibility = !user.email_visibility;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Email visibility updated successfully.",
      data: { email_visibility: user.email_visibility },
    });
  } catch (error) {
    console.error("Error toggling email visibility:", error);
    next(Boom.internal("Failed to update email visibility."));
  }
};

/**
 * Remove a course from the user's courses array.
 */
export const removeCourse = async (req, res, next) => {
  try {
    const userId = req.payload?.user_id;
    const { courseId } = req.body;
    if (!userId || !courseId) {
      return next(Boom.badRequest("User ID and Course ID are required."));
    }
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $pull: { courses: courseId } },
      { new: true }
    );
    if (!updatedUser) return next(Boom.notFound("User not found."));
    res.status(200).json({
      success: true,
      message: "Course removed successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error removing course:", error);
    next(Boom.internal("Error removing course."));
  }
};

/**
 * Add a tool to the user's tools array.
 * (Ensure your User model includes a 'tools' field)
 */
export const addTool = async (req, res, next) => {
  try {
    const userId = req.payload?.user_id;
    const { toolId } = req.body;
    if (!userId || !toolId) {
      return next(Boom.badRequest("User ID and Tool ID are required."));
    }
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { tools: toolId } },
      { new: true }
    );
    if (!updatedUser) return next(Boom.notFound("User not found."));
    res.status(200).json({
      success: true,
      message: "Tool added successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error adding tool:", error);
    next(Boom.internal("Error adding tool."));
  }
};

/**
 * Remove a tool from the user's tools array.
 */
export const removeTool = async (req, res, next) => {
  try {
    const userId = req.payload?.user_id;
    const { toolId } = req.body;
    if (!userId || !toolId) {
      return next(Boom.badRequest("User ID and Tool ID are required."));
    }
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $pull: { tools: toolId } },
      { new: true }
    );
    if (!updatedUser) return next(Boom.notFound("User not found."));
    res.status(200).json({
      success: true,
      message: "Tool removed successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error removing tool:", error);
    next(Boom.internal("Error removing tool."));
  }
};

/**
 * Delete the current user's account.
 */
export const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.payload?.user_id;
    if (!userId) {
      return next(Boom.unauthorized("User not authenticated."));
    }
    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return next(Boom.notFound("User not found."));
    }
    res.status(200).json({
      success: true,
      message: "Account deleted successfully.",
      data: deletedUser,
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    next(Boom.internal("Error deleting account."));
  }
};

export const getUserProfileForChecker = async (req, res, next) => {
  try {
    const { targetUserId } = req.params;
    const checkerUserId = req.payload?.user_id;

    if (!targetUserId || !checkerUserId) {
      return next(Boom.badRequest("Both target user ID and checker user ID are required."));
    }

    // Fetch target user and checker user
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return next(Boom.notFound("Target user not found."));
    }

    // Compute totals (defaulting to 0 if arrays are missing)
    const totalMytribers = targetUser.mytribers ? targetUser.mytribers.length : 0;
    const totalCourses = targetUser.courses ? targetUser.courses.length : 0;
    const totalTribes = targetUser.joined_tribes ? targetUser.joined_tribes.length : 0;

    // Fetch tribe details for the joined tribes
    const joinedTribesDetails = await Mytribe.find({
      _id: { $in: targetUser.joined_tribes },
      status: true // Only include tribes with status: true
    }).select('title tribeCategory _id thumbnail');  // Fetch name, category, _id, thumbnail

    // Define minimal view fields (always visible)
    const minimalFields = {
      username: targetUser.username,
      profile_pic: targetUser.profile_pic,
      display_banner: targetUser.display_banner,
      title: targetUser.title,
      shortintro: targetUser.shortintro,
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
      totalMytribers,
      totalCourses,
      totalTribes,
    };
    if (targetUser.email_visibility) {
      minimalFields.email = targetUser.email;
    }

    // Define full view fields (complete profile)
    const fullFields = {
      username: targetUser.username,
      profile_pic: targetUser.profile_pic,
      display_banner: targetUser.display_banner,
      title: targetUser.title,
      shortintro: targetUser.shortintro,
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
      country: targetUser.country,
      gender: targetUser.gender,
      business_country: targetUser.business_country,
      business_industry: targetUser.business_industry,
      value_chainstake: targetUser.value_chainstake,
      markets_covered: targetUser.markets_covered,
      immediate_needs: targetUser.immediate_needs,
      phone: targetUser.phone,
      joined_tribes: joinedTribesDetails, // Include joined tribe details
      courses: targetUser.courses,
      tools: targetUser.tools,
      primary_business: targetUser.primary_business,
      facebook_link: targetUser.facebook_link,
      linkedin_link: targetUser.linkedin_link,
      instagram_link: targetUser.instagram_link,
      x_link: targetUser.x_link,
      web_link: targetUser.web_link,
      account_avaialability: targetUser.account_avaialability,
      aboutme: targetUser.aboutme,
      mytribers: targetUser.mytribers,
      totalMytribers,
      totalCourses,
      totalTribes,
    };
    if (targetUser.email_visibility) {
      fullFields.email = targetUser.email;
    }

    // Determine view based on privacy setting.
    // Assume targetUser.privacy exists and can be "private", "triber_only", or "public".
    const privacy = targetUser.privacy || "public";

    if (privacy === "private") {
      return res.status(200).json({ success: true, data: minimalFields });
    } else if (privacy === "triber_only") {
      // For triber_only, check if checker is mutual triber.
      const checkerUser = await User.findById(checkerUserId);
      if (!checkerUser) {
        return next(Boom.notFound("Checker user not found."));
      }
      const targetHasChecker = targetUser.mytribers.some(
        (id) => id.toString() === checkerUserId.toString()
      );
      const checkerHasTarget = checkerUser.mytribers.some(
        (id) => id.toString() === targetUserId.toString()
      );
      if (targetHasChecker && checkerHasTarget) {
        return res.status(200).json({ success: true, data: fullFields });
      } else {
        return res.status(200).json({ success: true, data: minimalFields });
      }
    } else {
      // Public: return full view.
      return res.status(200).json({ success: true, data: fullFields });
    }
  } catch (error) {
    console.error("Error fetching user profile for checker:", error);
    next(Boom.internal("Error fetching user profile."));
  }
};

export const getUserProfileForUser = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const excludeIds = req.body.excludeIds || [];

    const users = await User.aggregate([
      {
        $match: {
          _id: { $nin: excludeIds.map(id => new mongoose.Types.ObjectId(id)) },
        },
      },
      {
        $addFields: {
          randomSort: { $rand: {} }, // assign a random number
        },
      },
      { $sort: { randomSort: 1 } }, // sort by that random number
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          username: 1,
          title: 1,
          profile_pic: 1,
          display_banner: 1,
        },
      },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]);

    res.status(200).json({
      success: true,
      currentPage: page,
      data: users,
    });
  } catch (error) {
    console.error("Error fetching paginated random users:", error);
    next(Boom.internal("Error fetching random users."));
  }
};



export const searchTribers = async (req, res, next) => {
  try {
    const { query } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    if (!query || query.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Search query is required." });
    }

    const regex = new RegExp(query.trim(), "i");

    const results = await User.aggregate([
      {
        $addFields: {
          fullName: { $concat: ["$firstName", " ", "$lastName"] },
        },
      },
      {
        $match: {
          $or: [
            { fullName: regex },
            { username: regex },
          ],
        },
      },
      {
        $facet: {
          data: [
            {
              $project: {
                _id: 1,
                firstName: 1,
                lastName: 1,
                username: 1,
                title: 1,
                profile_pic: 1,
                display_banner: 1,
              },
            },
            { $skip: (page - 1) * limit },
            { $limit: limit },
          ],
          totalCount: [{ $count: "count" }],
        },
      },
    ]);


    const users = results[0].data;
    const totalUsers = results[0].totalCount[0]?.count || 0;

    res.status(200).json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(totalUsers / limit),
      data: users,
    });
  } catch (error) {
    console.error("Error searching tribers:", error);
    next(Boom.internal("Error searching tribers."));
  }
};





export const searchUsers = async (req, res, next) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ success: false, message: "Search query is required." });
    }

    // Perform case-insensitive search across firstName, lastName, and username
    const users = await User.find({
      $or: [
        { firstName: { $regex: query, $options: "i" } },
        { lastName: { $regex: query, $options: "i" } },
        { username: { $regex: query, $options: "i" } },
      ],
    }).select('_id firstName lastName username title');

    return res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error("Error searching users:", error);
    next(Boom.internal("Error searching users."));
  }
};


export const getAllCoursesForUser = async (req, res, next) => {
  try {
    const userId = req.payload?.user_id;
    if (!userId) {
      return next(Boom.unauthorized("User not authenticated."));
    }
    // Populate courses (adjust fields if needed)
    const user = await User.findById(userId).populate("courses", "title description");
    if (!user) return next(Boom.notFound("User not found."));
    res.status(200).json({ success: true, courses: user.courses || [] });
  } catch (error) {
    console.error("Error fetching courses for user:", error);
    next(Boom.internal("Error fetching courses for user."));
  }
};

/**
 * Get all tribers (friends) for the current user.
 */
export const getAllTribersForUser = async (req, res, next) => {
  try {
    const userId = req.payload?.user_id;
    if (!userId) {
      return next(Boom.unauthorized("User not authenticated."));
    }
    // Populate mytribers with minimal info.
    const user = await User.findById(userId).populate("mytribers", "username profile_pic");
    if (!user) return next(Boom.notFound("User not found."));
    res.status(200).json({ success: true, tribers: user.mytribers || [] });
  } catch (error) {
    console.error("Error fetching tribers for user:", error);
    next(Boom.internal("Error fetching tribers for user."));
  }
};

export const getAllFriendRequests = async (req, res, next) => {
  try {
    // Get current user id from the verified token (set by verifyAccessToken)
    const currentUserId = req.user && (req.user._id || req.user.id);
    // Also get the id provided by the client in the query parameters.
    const userIdFromQuery = req.query.userId;

    // Populate blocked users (assume 'blockedtribers' is the field storing blocked users).
    const user = await User.findById(userIdFromQuery)
      .populate("requests", "username profile_pic");

    if (!user) {
      return next(Boom.notFound("User not found."));
    }

    res.status(200).json({ success: true, requests: user.requests || [] });
  } catch (error) {
    console.error("Error fetching blocked users:", error);
    next(Boom.internal("Error fetching blocked users."));
  }
};

export const getAllFriendList = async (req, res, next) => {
  try {
    // Get current user id from the verified token (set by verifyAccessToken)
    const currentUserId = req.user && (req.user._id || req.user.id);
    // Get the id provided by the client in the query parameters.
    const userIdFromQuery = req.query.userId;
    // Get the page number from query parameters, default to 1.
    const page = parseInt(req.query.page) || 1;
    const perPage = 10;

    // Populate friend list (assume 'mytribers' is the field storing friend relationships).
    const user = await User.findById(userIdFromQuery)
      .populate({
        path: "mytribers",
        select: "username firstName lastName profile_pic",
        options: {
          skip: (page - 1) * perPage,
          limit: perPage,
        },
      });

    if (!user) {
      return next(Boom.notFound("User not found."));
    }

    res.status(200).json({ success: true, requests: user.mytribers || [] });
  } catch (error) {
    console.error("Error fetching friend list:", error);
    next(Boom.internal("Error fetching friend list."));
  }
};
export const getFriendList = async (req, res, next) => {
  try {
    // Get current user id from the verified token (set by verifyAccessToken)
    const currentUserId = req.user && (req.user._id || req.user.id);
    // Get the id provided by the client in the query parameters.
    const userIdFromQuery = req.query.userId;

    // Populate friend list (assume 'mytribers' is the field storing friend relationships).
    const user = await User.findById(userIdFromQuery)
      .populate({
        path: "mytribers",
        select: "username firstName lastName profile_pic",
      });

    if (!user) {
      return next(Boom.notFound("User not found."));
    }

    res.status(200).json({ success: true, requests: user.mytribers || [] });
  } catch (error) {
    console.error("Error fetching friend list:", error);
    next(Boom.internal("Error fetching friend list."));
  }
};

export const getUsersChatInfo = async (req, res, next) => {
  try {
    // Accept IDs either as a comma-separated query param or as an array in the JSON body
    let { userIds } = req.query;
    if (!userIds && req.body.userIds) {
      userIds = req.body.userIds;
    }

    if (!userIds) {
      return next(Boom.badRequest('Missing userIds parameter'));
    }

    // Normalize to an array
    if (typeof userIds === 'string') {
      userIds = userIds.split(',').map((id) => id.trim());
    }

    // Query MongoDB for those users and only select the needed fields
    const users = await User.find(
      { _id: { $in: userIds } },
      'firstName lastName profile_pic'
    );

    // If you want to preserve input order, you could sort here by
    // matching the returned docs against the original userIds array.

    res.status(200).json({ success: true, users });
  } catch (error) {
    console.error('Error fetching users info:', error);
    next(Boom.internal('Error fetching users info.'));
  }
};

import ChatLobby from "../../models/chatlobby.js"; // Adjust the import path as needed

export const getChatLobby = async (req, res, next) => {
  try {
    const currentUserId = req.query.userId;
    if (!currentUserId) {
      return next(Boom.unauthorized("User not authenticated."));
    }

    // Find all chat lobbies where the current user is a participant.
    const chatLobbies = await ChatLobby.find({ participants: currentUserId })
      .populate({
        path: "participants",
        select: "_id firstName lastName profile_pic", // Only select firstName and lastName
      });

    // Map over the chat lobbies and extract the other participant.
    // (Assuming a one-to-one chat lobby with two participants.)
    const lobbies = chatLobbies.map((lobby) => {
      // Filter out the current user from the participants array.
      const otherParticipant = lobby.participants.find(
        (participant) => participant._id.toString() !== currentUserId.toString()
      );
      return {
        chatLobbyId: lobby.chatLobbyId,
        // Return the other participant's first and last names (or null if not found)
        otherParticipant: otherParticipant
          ? {
            _id: otherParticipant._id,
            firstName: otherParticipant.firstName,
            lastName: otherParticipant.lastName,
            profile_pic: otherParticipant.profile_pic,
          }
          : null,
        // Optionally include messages or any other fields if needed:
        messages: lobby.messages,
      };
    });

    res.status(200).json({ success: true, lobbies });
  } catch (error) {
    console.error("Error fetching chat lobbies:", error);
    next(Boom.internal("Error fetching chat lobbies."));
  }
};

/**
 * Get all tribes (joined tribes) for the current user.
 */
export const getAllTribesForUser = async (req, res, next) => {
  try {
    const userId = req.payload?.user_id;
    if (!userId) {
      return next(Boom.unauthorized("User not authenticated."));
    }
    // Populate joined_tribes with minimal tribe info.
    const user = await User.findById(userId).populate("joined_tribes", "title shortDescription");
    if (!user) return next(Boom.notFound("User not found."));
    res.status(200).json({ success: true, tribes: user.joined_tribes || [] });
  } catch (error) {
    console.error("Error fetching tribes for user:", error);
    next(Boom.internal("Error fetching tribes for user."));
  }
};

/**
 * Get all blocked users for the current user.
 */
export const getAllBlockedForUser = async (req, res, next) => {
  try {
    // Get current user id from the verified token (set by verifyAccessToken)
    const currentUserId = req.user && (req.user._id || req.user.id);
    // Also get the id provided by the client in the query parameters.
    const userIdFromQuery = req.query.userId;

    // Populate blocked users (assume 'blockedtribers' is the field storing blocked users).
    const user = await User.findById(userIdFromQuery)
      .populate("blockedtribers", "username profile_pic");

    if (!user) {
      return next(Boom.notFound("User not found."));
    }

    res.status(200).json({ success: true, blocked: user.blockedtribers || [] });
  } catch (error) {
    console.error("Error fetching blocked users:", error);
    next(Boom.internal("Error fetching blocked users."));
  }
};

export const getTribeDetails = async (req, res, next) => {
  try {
    const { tribeId } = req.params;
    if (!tribeId) {
      return next(Boom.badRequest("Tribe ID is required."));
    }

    // Find the tribe and optionally populate member/admin details if needed.
    const tribe = await Mytribe.findById(tribeId)
      .populate("members", "username profile_pic")
      .populate("admins", "username profile_pic");

    if (!tribe) {
      return next(Boom.notFound("Tribe not found."));
    }

    // Build the details object using only the requested fields.
    const details = {
      title: tribe.title,
      members: tribe.members,
      admins: tribe.admins,
      shortDescription: tribe.shortDescription,
      longDescription: tribe.longDescription,
      status: tribe.status,
      rating: tribe.rating,
      thumbnail: tribe.thumbnail,
      banner: tribe.banner,
      tribeCategory: tribe.tribeCategory,
      joinPolicy: tribe.joinPolicy,
      membersLimit: tribe.membersLimit,
    };

    res.status(200).json({
      success: true,
      data: details,
    });
  } catch (error) {
    console.error("Error fetching tribe details:", error);
    next(Boom.internal("Error fetching tribe details."));
  }
};

export const blockUserFromTribe = async (req, res, next) => {
  try {
    const adminId = req.payload?.user_id;
    const { tribeId, targetUserId } = req.body;
    if (!adminId || !tribeId || !targetUserId) {
      return next(Boom.badRequest("Tribe ID, target user ID and admin user ID are required."));
    }

    // Fetch the tribe
    const tribe = await Mytribe.findById(tribeId);
    if (!tribe) return next(Boom.notFound("Tribe not found."));

    // Verify that the current user is an admin of the tribe
    if (!tribe.admins.some(id => id.toString() === adminId.toString())) {
      return next(Boom.forbidden("Only tribe admins can block users."));
    }

    // If the target user is currently a member, remove them from members
    await Mytribe.findByIdAndUpdate(tribeId, { $pull: { members: targetUserId } });

    // Add the target user to the tribe's blockedUsers array (if not already present)
    const updatedTribe = await Mytribe.findByIdAndUpdate(
      tribeId,
      { $addToSet: { blockedUsers: targetUserId } },
      { new: true }
    );
    if (!updatedTribe) return next(Boom.notFound("Tribe not found after update."));

    // Also add this tribe to the target user's blockedbytribe array
    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      { $addToSet: { blockedbytribe: tribeId } },
      { new: true }
    );
    if (!updatedUser) return next(Boom.notFound("Target user not found."));

    res.status(200).json({
      success: true,
      message: "User blocked from tribe successfully.",
      data: { tribe: updatedTribe, user: updatedUser },
    });
  } catch (error) {
    console.error("Error blocking user from tribe:", error);
    next(Boom.internal("Error blocking user from tribe."));
  }
};

/**
 * Unblock a user from a tribe.
 * Only a tribe admin can perform this action.
 * Expects in req.body: { tribeId, targetUserId }
 */
export const unblockUserFromTribe = async (req, res, next) => {
  try {
    const adminId = req.payload?.user_id;
    const { tribeId, targetUserId } = req.body;
    if (!adminId || !tribeId || !targetUserId) {
      return next(Boom.badRequest("Tribe ID, target user ID and admin user ID are required."));
    }

    // Fetch the tribe
    const tribe = await Mytribe.findById(tribeId);
    if (!tribe) return next(Boom.notFound("Tribe not found."));

    // Verify that the current user is an admin of the tribe
    if (!tribe.admins.some(id => id.toString() === adminId.toString())) {
      return next(Boom.forbidden("Only tribe admins can unblock users."));
    }

    // Remove the target user from tribe's blockedUsers array
    const updatedTribe = await Mytribe.findByIdAndUpdate(
      tribeId,
      { $pull: { blockedUsers: targetUserId } },
      { new: true }
    );
    if (!updatedTribe) return next(Boom.notFound("Tribe not found after update."));

    // Remove this tribe from the target user's blockedbytribe array
    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      { $pull: { blockedbytribe: tribeId } },
      { new: true }
    );
    if (!updatedUser) return next(Boom.notFound("Target user not found."));

    res.status(200).json({
      success: true,
      message: "User unblocked from tribe successfully.",
      data: { tribe: updatedTribe, user: updatedUser },
    });
  } catch (error) {
    console.error("Error unblocking user from tribe:", error);
    next(Boom.internal("Error unblocking user from tribe."));
  }
};



export default {
  Register,
  Login,
  RefreshToken,
  Logout,
  updateAddress,
  Me,
  updateUserInfo,
  GetTotalNumberOfRegistrationsByDateRange,
  getAddress,
  getAllUsers,
  getOrCreateChatLobby,
  getUserChatLobbies,
  getChatMessages,
  removeRejectedFriendRequest,
  updateUserAdminDetails,
  acceptTribeRequest,
  rejectTribeRequest,
  createChatLobby,
  getAllAdminUsers,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeUserProfilePic,
  blockUser,
  cancelSentFriendRequest,
  toggleEmailVisibility,
  unblockUser,
  removeFriend,
  getAllFriendList,
  getFriendList,
  updateUserPassword,
  getAllFriendRequests,
  removeUserBanner,
  updateUsername,
  joinTribe,
  leaveTribe,
  addCourse,
  removeCourse,
  addTool,
  removeTool,
  deleteAccount,
  updateUserMedia,
  checkDuplicates,
  getUserProfileForChecker,
  getAllCoursesForUser,
  getAllTribersForUser,
  blockUserFromTribe,
  getAllTribesForUser,
  getAllBlockedForUser,
  unblockUserFromTribe,
  deleteChatForUser,
  getTribeDetails,
  getTribeMembers,
  deleteChatLobbyForUser,
  getUserProfileForUser,
  kickUserFromTribe,
  searchUsers,
  searchTribers,
  getChatLobby,
  deleteUser,
  getUsersChatInfo,
  forwardMessage,
};