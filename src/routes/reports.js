import express from 'express';
const router = express.Router();

import Report from '../controllers/reports';

router.post('/', Report.Create);
router.get('/', Report.List);
router.get('/my-report', Report.GetMyReport);

export default router;