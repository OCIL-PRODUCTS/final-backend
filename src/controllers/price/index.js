import Price from "../../models/price"
// Get pricing details for small, large, and custom tiers.
const getSmallLargeCustomPricing = async () => {
  try {
    const priceDoc = await Price.findOne();
    if (!priceDoc) {
      // Return default values if no document is found.
      return {
        small: { price: 0, tokens: 0 },
        large: { price: 0, tokens: 0 },
        custom: { price: 0.3, tokens: 0 },
      };
    }
    return {
      small: priceDoc.small,
      large: priceDoc.large,
      custom: priceDoc.custom,
    };
  } catch (error) {
    throw error;
  }
};

// Get pricing details for basic and premium tiers.
const getBasicPremiumPricing = async () => {
  try {
    const priceDoc = await Price.findOne();
    if (!priceDoc) {
      return {
        basic: {
          perMonth: { price: 0, tokens: 0 },
          perYear: { price: 0, tokens: 0 },
        },
        premium: {
          perMonth: { price: 0, tokens: 0 },
          perYear: { price: 0, tokens: 0 },
        },
      };
    }
    return {
      basic: priceDoc.basic,
      premium: priceDoc.premium,
    };
  } catch (error) {
    throw error;
  }
};

// Update all pricing fields at once.
// pricingData should be an object matching the Price schema structure.
const updatePricing = async (pricingData) => {
  try {
    const updatedDoc = await Price.findOneAndUpdate({}, pricingData, {
      new: true,
      upsert: true,
    });
    return updatedDoc;
  } catch (error) {
    throw error;
  }
};

// Get the entire pricing document (all fields) at once.
const getAllPricing = async () => {
  const priceDoc = await Price.findOne();
  if (!priceDoc) {
    return {
      small:  { price: 0, tokens: 0 },
      large:  { price: 0, tokens: 0 },
      custom: { price: 0.3, tokens: 0 },
      basic: {
        perMonth: { price: 0, tokens: 0 },
        perYear:  { price: 0, tokens: 0 },
      },
      premium: {
        perMonth: { price: 0, tokens: 0 },
        perYear:  { price: 0, tokens: 0 },
      },
      Characterpertoken: 4,
      FinalDiscount:     0.0,
      BasicDiscount:     0.0,
      PremiumDiscount:   0.0,
    };
  }
  return {
    ...priceDoc.toObject(),
    BasicDiscount:   priceDoc.BasicDiscount,
    PremiumDiscount: priceDoc.PremiumDiscount,
  };
};

module.exports = {
  getSmallLargeCustomPricing,
  getBasicPremiumPricing,
  updatePricing,
  getAllPricing,
};
