import express from 'express';
import { getAllNews, replaceNewsSection } from '../controllers/news';

const router = express.Router();

router.get('/', getAllNews);
router.put('/:newsId/replace', replaceNewsSection);

export default router;
