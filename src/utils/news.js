// jobs/newsCron.js
import cron from "node-cron";
import moment from "moment-timezone";
import fetch from "node-fetch";      // or omit on Node 18+
import News from "../models/news.js"; // adjust path as needed

// every day at midnight ET (Canada)
cron.schedule(
  "0 0 * * *",
  async () => {
    const now = moment().tz("America/Toronto");

    try {
      const API_KEY = process.env.GNEWS_API_KEY;
      const url = `https://gnews.io/api/v4/top-headlines?country=ca&lang=en&token=${API_KEY}&max=5`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.articles?.length) {
        console.warn("⚠️ No articles from GNews for Canada");
        return;
      }

      const top5 = data.articles.slice(0, 5);
      const img     = top5.map(a => a.image       || "");
      const title   = top5.map(a => a.title       || "");
      const content = top5.map(a => a.description || "");
      const link    = top5.map(a => a.url         || "");

      // find the very first doc, or create if none:
      let doc = await News.findOne().sort({ createdAt: 1 });
      if (doc) {
        doc.img     = img;
        doc.title   = title;
        doc.content = content;
        doc.link    = link;
        await doc.save();
      } else {
        doc = new News({ img, title, content, link });
        await doc.save();
      }
    } catch (err) {
      console.error("❌ Error in newsCron:", err);
    }
  },
  { timezone: "America/Toronto" }
);
