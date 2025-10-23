
import Discount from "../../models/discount"; // adjust path if needed
import User from "../../models/user"
import Boom from "@hapi/boom"; // Preferred

/**
 * Helper: generate a random 6-character alphanumeric token.
 */
const generateToken = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 6; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

export const createDiscount = async (req, res, next) => {
  try {
    const {
      value,
      for: forField,
      count = 1,
      numberOfUses = 1,
      subscription = "basic", // New field for subscription type
      period = "month", // New field for period
    } = req.body;

    // Validate required fields
    if (value == null || !forField) {
      return next(Boom.badRequest("Fields `value` and `for` are required."));
    }
    if (typeof value !== 'number') {
      return next(Boom.badRequest("Field `value` must be a number."));
    }
    if (!['tokens', 'subscription', 'course'].includes(forField)) {
      return next(Boom.badRequest("Field `for` must be either 'tokens' or 'subscription'."));
    }

    // Validate count
    const cnt = parseInt(count, 10);
    if (isNaN(cnt) || cnt < 1 || cnt > 100) { 
      return next(Boom.badRequest("Field `count` must be a positive integer (max 100)."));
    }

    // Validate numberOfUses
    const numUses = parseInt(numberOfUses, 10);
    if (isNaN(numUses) || numUses < 1) {
      return next(Boom.badRequest("Field `numberOfUses` must be a positive integer."));
    }

    const createdCoupons = [];
    for (let i = 0; i < cnt; i++) {
      let token;
      let unique = false;
      const maxAttempts = 10;
      let attempts = 0;
      while (!unique && attempts < maxAttempts) {
        token = generateToken();
        const exists = await Discount.findOne({ token });
        if (!exists) unique = true;
        attempts++;
      }
      if (!unique) {
        return next(Boom.internal("Failed to generate a unique discount token. Try again."));
      }

      const discount = new Discount({
        value,
        token,
        for: forField,
        subscription, // Store the subscription type
        period, // Store the period
        numberOfUses: numUses,
        used_by: [],
      });

      const saved = await discount.save();
      createdCoupons.push(saved);
    }

    res.status(201).json({
      success: true,
      message: `${createdCoupons.length} discount(s) created successfully.`,
      data: createdCoupons,
    });
  } catch (error) {
    console.error("Error creating discount:", error);
    next(Boom.internal("Error creating discount."));
  }
};


/**
 * Delete a discount by ID.
 * Expects req.params.discountId
 */
export const deleteDiscount = async (req, res, next) => {
  try {
    const { discountId } = req.params;
    if (!discountId) {
      return next(Boom.badRequest("Discount ID is required."));
    }
    const discount = await Discount.findById(discountId);
    if (!discount) {
      return next(Boom.notFound("Discount not found."));
    }
    await Discount.findByIdAndDelete(discountId);
    res.json({ success: true, message: "Discount deleted successfully." });
  } catch (error) {
    console.error("Error deleting discount:", error);
    next(Boom.internal("Error deleting discount."));
  }
};

/**
 * Get all discounts.
 */
export const getAllDiscounts = async (req, res, next) => {
  try {
    // Populate used_by array of User references, selecting only username
    const discounts = await Discount.find({})
      .populate('used_by', 'username'); // adjust if your user field name differs

    res.json({ success: true, data: discounts });
  } catch (error) {
    console.error("Error fetching discounts:", error);
    next(Boom.internal("Error fetching discounts."));
  }
};

export const validateDiscount = async (req, res, next) => {
  try {
    const { token, userId, packageType, period } = req.body;

    if (!token) {
      return next(Boom.badRequest("Discount token is required."));
    }

    // Find discount by token
    const discount = await Discount.findOne({ token });

    if (!discount) {
      return next(Boom.notFound("Discount not found or invalid token."));
    }

    // ✅ Map packageType to expected discount.for value
    let expectedDiscountFor;
    let sub;
    if (["basic", "premium", "subscription"].includes(packageType)) {
      expectedDiscountFor = "subscription";
      sub = packageType;
    } else if (["small", "large", "custom"].includes(packageType)) {
      expectedDiscountFor = "tokens";
    } else if (packageType === "course") {
      expectedDiscountFor = "course";
    }

    // ✅ Check if discount.for matches expected value
    if (discount.for !== expectedDiscountFor) {
      return next(Boom.badRequest("This token is not applicable for the selected package type."));
    }
    console.log(sub);
    console.log(discount.subscription);
    if(discount.subscription !== sub){
      return next(Boom.badRequest("This token is not applicable for the selected subsciption type."));
    }
        console.log(period);
    console.log(discount.period);
    if(discount.period !== period){
      return next(Boom.badRequest("This token is not applicable for the selected period type."));
    }
    // Check if it has remaining uses
    if (discount.used_by.length >= discount.numberOfUses) {
      return next(Boom.badRequest("This discount has already been fully used."));
    }

    // Optional: Check if user has already used this discount
    if (userId && discount.used_by.includes(userId)) {
      return next(Boom.badRequest("You have already used this discount."));
    }

    res.json({
      success: true,
      message: "Discount token is valid.",
      data: {
        token: discount.token,
        value: discount.value,
        for: discount.for,
        remainingUses: discount.numberOfUses - discount.used_by.length,
      },
    });
  } catch (error) {
    console.error("Error validating discount:", error);
    next(Boom.internal("Error validating discount."));
  }
};


export default {
  getAllDiscounts,
  createDiscount,
  deleteDiscount,
  validateDiscount,
};
