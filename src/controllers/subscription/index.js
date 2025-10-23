import User from '../../models/user';
import {
  createSubscription,
  renewSubscription,
  downgradeSubscription,
  cancelSubscription,
  upgradeSubscription,
  applyDiscount
} from './sub';
 
export const createSubscriptionController = async (req, res) => {
  try {
    const { userId, plan, period, discountCode } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const result = await createSubscription(user, plan, period, discountCode);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const downgradeController = async (req, res) => {
  try {
    const { userId, downgradeTo } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const result = await downgradeSubscription(user, downgradeTo);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const cancelController = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const result = await cancelSubscription(user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const upgradeController = async (req, res) => {
  try {
    const { userId, upgradeTo } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const result = await upgradeSubscription(user, upgradeTo);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const applyDiscountController = async (req, res) => {
  try {
    const { userId, discountCode } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const result = await applyDiscount(user, discountCode);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};