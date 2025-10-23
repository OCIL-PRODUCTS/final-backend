import express from 'express';
const router = express.Router();

import Order from '../controllers/order';

router.post('/', Order.Create);
router.get('/', Order.List);
router.get('/my-orders', Order.GetMyOrders);
router.put('/update-status', Order.UpdateStatus);
router.get('/total-orders/:rangeType', Order.GetTotalOrdersByDateRange);
router.get('/total-order-count/:rangeType', Order.GetTotalNumberOfOrdersByDateRange);
router.get('/total-order-category/:rangeType', Order.GetTotalSoldByCategory);
router.get('/total-order-gender/:rangeType', Order.GetTotalSoldByGender);
router.get('/total-orders-by-month/:year', Order.GetTotalOrdersByMonth);


export default router;
