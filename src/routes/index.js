import { Router } from 'express';
// helpers
import { verifyAccessToken } from '../helpers/jwt';

// routes
import auth from './auth';
import chat from './uploads';
import messageRoutes from './message'; // our new routes file for deletion
import courseRoutes from './course'; // our new routes file for deletion
import toolRoutes from './tools'; // our new routes file for deletion
import liftAiRoutes from './lift-ai'; // our new routes file for deletion
import mytribes from './mytribes'; // our new routes file for deletion
import price from './price'; // our new routes file for deletion
import stats from './stats'; // our new routes file for deletion
//import product from './product';
//import order from './order';
import categories from './categories';
//import reports from './reports';
import verify from './verification';
import news from './news';
import images from './images';
import testimonals from './testimonals';
import support from './support';
import notification from './notifications';
import admin from './admin';
import payment from './payment';
import discount from './discount';
import subscription from './subcription';

const router = Router();

router.get('/', (req, res) => {
  res.end('hey');
});
router.use('/auth', auth);
router.use('/verify', verify);
router.use('/', chat);
router.use('/messages', messageRoutes);
router.use('/course', courseRoutes);
router.use('/tool', toolRoutes);
router.use("/my-tribes", mytribes);
router.use("/lift-ai", liftAiRoutes);
router.use("/price", price);
router.use("/testimonals", testimonals);
router.use("/admin", admin);
router.use("/news", news);
router.use("/support", support);
router.use("/notifications", notification);
router.use("/subscription", subscription);
router.use("/payment", payment);
router.use("/stats", stats);
router.use('/categories', categories);
router.use('/discount', discount);
router.use('/images', images);


export default router;
