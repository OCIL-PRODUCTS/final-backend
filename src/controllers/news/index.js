// controllers/news.js
import News from "../../models/news.js";     // adjust path as needed
import Boom from "@hapi/boom"; // Preferred
import fetch from "node-fetch";             // or omit on Node 18+

// GET /news – retrieve all news documents
export const getAllNews = async (req, res, next) => {
  try {
    const newsList = await News.find();
    res.json({ news: newsList });
  } catch (err) {
    next(err);
  }
};

// PUT /news/:newsId/replace – swap in a random business article at one index
export const replaceNewsSection = async (req, res, next) => {
  const { newsId } = req.params;
  const idx = parseInt(req.body.index, 10);

  // validation
  if (isNaN(idx) || idx < 0) {
    return next(Boom.badRequest("Invalid section index"));
  }

  try {
    const doc = await News.findById(newsId);
    if (!doc) {
      return next(Boom.notFound("News document not found"));
    }

    // fetch up to 10 business articles
    const API_KEY = process.env.GNEWS_API_KEY;
    const url = `https://gnews.io/api/v4/top-headlines?topic=business&lang=en&token=${API_KEY}&max=10`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.articles?.length) {
      return next(Boom.badGateway("No articles returned from GNews"));
    }

    // bound‐check all four arrays
    const maxSections = Math.max(
      doc.img?.length || 0,
      doc.title?.length || 0,
      doc.content?.length || 0,
      doc.link?.length || 0
    );
    if (idx >= maxSections) {
      return next(Boom.badRequest("Section index out of bounds"));
    }

    // only pick articles whose URL isn’t already in this doc
    const existing = doc.link || [];
    const unique = data.articles.filter(a => a.url && !existing.includes(a.url));
    if (unique.length === 0) {
      return next(Boom.badGateway("No unique business articles available"));
    }

    // random pick
    const rand = unique[Math.floor(Math.random() * unique.length)];

    // overwrite at idx
    doc.img[idx]     = rand.image       || "";
    doc.title[idx]   = rand.title       || "";
    doc.content[idx] = rand.description || "";
    doc.link[idx]    = rand.url         || "";

    await doc.save();
    res.json({ message: "Section replaced", news: doc });
  } catch (err) {
    next(err);
  }
};

export default { getAllNews, replaceNewsSection };
