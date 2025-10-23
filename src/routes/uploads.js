import express from 'express';
import { upload, uploadFileToFirebase } from '../socketHandlers/fileHandlers';

const router = express.Router();

router.post('/uploadmsg', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  try {
    const fileUrl = await uploadFileToFirebase(req.file);
    console.log(req.body.caption);
    res.json({
      message: 'File uploaded successfully',
      file: req.file.originalname,
      caption:req.body.caption,
      fileUrl
    });
  } catch (error) {
    console.error('Firebase upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

export default router;
