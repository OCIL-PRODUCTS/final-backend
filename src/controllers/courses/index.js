// storage.js
import Course from "../../models/courses";
import User from "../../models/user";
import Notification from "../../models/notifications";
import Boom from "@hapi/boom"; // Preferred
const { v4: uuidv4 } = require("uuid");

// Google Cloud Storage client
const { Storage } = require("@google-cloud/storage");

// Instantiate once (will pick up GOOGLE_APPLICATION_CREDENTIALS)
const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID, // make sure this is set in .env
});
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);


// Function to upload files to GCS and get the public URL
export const handleFirebaseUpload = async (file, folder, nameFormat) => {
  const fileName = `${nameFormat}-${uuidv4()}-${file.originalname}`;
  const filePath = `${folder}/${fileName}`;
  const blob = bucket.file(filePath);

  // Upload buffer
  await blob.save(file.buffer, {
    resumable: false,
    metadata: { contentType: file.mimetype },
  });
  // Return the public URL
  return `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(filePath)}`;
};

// Function to delete files from GCS given the public URL
export const deleteFromFirebase = async (publicUrl) => {
  try {
    // Extract the path after bucket name
    const parts = publicUrl.split(`${bucket.name}/`);
    if (parts.length !== 2) throw new Error(`Unexpected URL format: ${publicUrl}`);
    const filePath = decodeURIComponent(parts[1]);

    await bucket.file(filePath).delete();
  } catch (err) {
    console.error("GCS deletion error:", err);
    // Re-throw with original message for debugging
    throw new Error(`Failed to delete ${publicUrl}: ${err.message}`);
  }
};


/**
 * Create a new course.
 */
export const createCourse = async (req, res, next) => {
  try {
    const {
      title,
      Author,
      AuthorLink,
      courseCategory,
      description,
      courseContent,
      shortdescription,
      price,
    } = req.body;

    // Parse lesson-based link arrays sent as JSON strings by frontend
    const assessmentLinks = req.body.assessmentLinks ? JSON.parse(req.body.assessmentLinks) : [];
    const externalLinks = req.body.externalLinks ? JSON.parse(req.body.externalLinks) : [];
    const videosLinks = req.body.videosLinks ? JSON.parse(req.body.videosLinks) : [];
    const referenceLinks = req.body.referenceLinks ? JSON.parse(req.body.referenceLinks) : [];

    // Thumbnail upload (required)
    let thumbnailUrl;
    if (req.files && req.files["thumbnail"] && req.files["thumbnail"][0]) {
      thumbnailUrl = await handleFirebaseUpload(
        req.files["thumbnail"][0],
        "Thumbnail",
        `Course-${title}-thumbnail`
      );
    } else {
      return next(Boom.badRequest("Thumbnail file is required."));
    }

    // Parse filesMeta mapping (frontend sends filename -> lesson numbers)
    // filesMeta example: [{ lesson: [1], filename: "myfile.pdf" }, ...]
    const filesMeta = req.body.filesMeta ? JSON.parse(req.body.filesMeta) : [];

    // If there are uploaded files, upload them and group by lesson numbers
    let filesLessonsArray = []; // final shape: [{ lesson: [Number], content: [String] }, ...]
    if (req.files && req.files["files"] && req.files["files"].length > 0) {
      // Map lessonNumber (string) -> array of uploaded file URLs
      const lessonMap = new Map();

      // We'll upload each file and use filesMeta to determine which lesson(s) it belongs to.
      // Note: we match by originalname using file.originalname (multer). If no meta found,
      // we default to lesson 1 (or you may choose to skip).
      for (const file of req.files["files"]) {
        // Upload to firebase
        const uploadedUrl = await handleFirebaseUpload(file, "Files", `Course-${title}-file`);

        // Find matching meta entries for this filename
        const matchingMetas = filesMeta.filter((m) => m.filename === file.originalname);

        if (matchingMetas.length > 0) {
          // For each meta entry, for each lesson number listed, push the uploaded url
          for (const meta of matchingMetas) {
            const lessonNums = Array.isArray(meta.lesson) ? meta.lesson : [meta.lesson];
            for (const ln of lessonNums) {
              const key = String(ln);
              if (!lessonMap.has(key)) lessonMap.set(key, []);
              lessonMap.get(key).push(uploadedUrl);
            }
          }
        } else {
          // No matching meta found — fallback behavior: push into lesson 1
          const key = "1";
          if (!lessonMap.has(key)) lessonMap.set(key, []);
          lessonMap.get(key).push(uploadedUrl);
        }
      }

      // Convert map into the model shape: [{ lesson: [Number], content: [String] }, ...]
      filesLessonsArray = Array.from(lessonMap.entries()).map(([lessonNum, urls]) => ({
        lesson: [Number(lessonNum)],
        content: urls,
      }));

      // Optional: If frontend also sent a "filesLessonsShape" placeholder and you want to
      // include lessons with no uploaded files, you can merge them here.
      // Example: req.body.filesLessonsShape = JSON.parse(...) -> includes lesson placeholders.
      if (req.body.filesLessonsShape) {
        try {
          const placeholders = JSON.parse(req.body.filesLessonsShape);
          // placeholders expected like: [{ lesson: [n], contentNames: [null, null] }, ...]
          placeholders.forEach((ph) => {
            const ln = Array.isArray(ph.lesson) ? ph.lesson[0] : ph.lesson;
            const key = String(ln);
            if (!lessonMap.has(key)) {
              // create an empty entry for this lesson
              filesLessonsArray.push({ lesson: [Number(key)], content: [] });
            }
          });
        } catch (err) {
          // ignore parse errors for optional shape
        }
      }
    }

    // Create course document using lesson-shaped fields
    const course = new Course({
      title,
      Author,
      AuthorLink,
      thumbnail: thumbnailUrl,
      courseCategory,
      description,
      courseContent,
      files: filesLessonsArray, // [{ lesson: [1], content: ["url1","url2"] }, ...]
      assessmentLinks,
      externalLinks,
      videosLinks,
      shortdescription,
      referenceLinks,
      price,
    });

    const savedCourse = await course.save();

    // --- Notification Logic for Course Creation ---
    const notificationData = `New course '${title}' has been created.`;
    const users = await User.find({}, "_id");

    if (users.length) {
      const bulkOperations = users.map((user) => ({
        updateOne: {
          filter: { user: user._id },
          update: {
            $setOnInsert: { user: user._id },
            $push: {
              type: { $each: ["coursecreate"] },
              data: { $each: [notificationData] },
            },
          },
          upsert: true,
        },
      }));

      await Notification.bulkWrite(bulkOperations);
    } else {
      console.warn("No users found to send course creation notification.");
    }
    // --- End Notification Logic ---

    res.status(201).json(savedCourse);
  } catch (error) {
    console.error("Error creating course:", error);
    next(Boom.internal("Error creating course."));
  }
};


/**
 * Update an existing course by ID.
 */
export const updateCourse = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) return next(Boom.notFound("Course not found."));

    // -------------------
    // Parse incoming simple fields
    // -------------------
    const {
      title,
      Author,
      AuthorLink,
      courseCategory,
      shortdescription,
      description,
      courseContent,
      price,
    } = req.body;

    // Update basic fields
    if (title !== undefined) course.title = title;
    if (Author !== undefined) course.Author = Author;
    if (AuthorLink !== undefined) course.AuthorLink = AuthorLink;
    if (courseCategory !== undefined) course.courseCategory = courseCategory;
    if (shortdescription !== undefined) course.shortdescription = shortdescription;
    if (description !== undefined) course.description = description;
    if (courseContent !== undefined) course.courseContent = courseContent;
    if (price !== undefined) course.price = price;

    // -------------------
    // Parse filesToRemove (can be single string or array)
    // -------------------
    const filesToRemoveRaw = req.body.filesToRemove;
    const filesToRemove = [];
    if (filesToRemoveRaw) {
      if (Array.isArray(filesToRemoveRaw)) {
        filesToRemove.push(...filesToRemoveRaw);
      } else if (typeof filesToRemoveRaw === "string") {
        // If body-parsing created a JSON string of array, try parse
        try {
          const parsed = JSON.parse(filesToRemoveRaw);
          if (Array.isArray(parsed)) filesToRemove.push(...parsed);
          else filesToRemove.push(parsed);
        } catch {
          filesToRemove.push(filesToRemoveRaw);
        }
      }
    }

    // Delete flagged files from storage (fire & forget here but we await)
    if (filesToRemove.length) {
      await Promise.all(filesToRemove.map((url) => deleteFromFirebase(url)));
    }

    // -------------------
    // Thumbnail handling
    // -------------------
    if (req.files && req.files["thumbnail"] && req.files["thumbnail"][0]) {
      // Delete old thumbnail if exists
      if (course.thumbnail) {
        try {
          await deleteFromFirebase(course.thumbnail);
        } catch (err) {
          console.warn("Failed to delete old thumbnail:", err);
        }
      }
      const thumbFile = req.files["thumbnail"][0];
      const newThumbUrl = await handleFirebaseUpload(thumbFile, "Thumbnail", `Course-${course.title}-thumb`);
      course.thumbnail = newThumbUrl;
    }

    // -------------------
    // Parse lesson-shaped arrays (frontend sends JSON strings for these)
    // If the field is already an array, we'll accept that.
    // Expected shape: [{ lesson: [1], content: ["...","..."] }, ...]
    // -------------------
    const parseMaybeJson = (val) => {
      if (val === undefined || val === null) return undefined;
      if (Array.isArray(val)) return val;
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch {
          // if string is a single value, return array of that value
          return [val];
        }
      }
      return val;
    };

    const videosLinksIncoming = parseMaybeJson(req.body.videosLinks);
    const externalLinksIncoming = parseMaybeJson(req.body.externalLinks);
    const referenceLinksIncoming = parseMaybeJson(req.body.referenceLinks);
    const assessmentLinksIncoming = parseMaybeJson(req.body.assessmentLinks);

    // If the incoming values are arrays of lesson-objects, set them directly.
    // If they are legacy flat arrays (array of strings), convert to lesson-shaped with lesson [1]
    const normalizeToLessonArray = (val) => {
      if (val === undefined) return undefined;
      if (Array.isArray(val) && val.length === 0) return val;
      // If first element looks like object with lesson/content
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && (val[0].lesson !== undefined || val[0].content !== undefined)) {
        // Ensure each entry has array for lesson and content
        return val.map((v) => ({
          lesson: Array.isArray(v.lesson) ? v.lesson : (v.lesson !== undefined ? [v.lesson] : [1]),
          content: Array.isArray(v.content) ? v.content : (v.content ? [v.content] : []),
        }));
      }
      // Else treat val as flat array of strings -> put them under lesson 1
      const arr = Array.isArray(val) ? val : [val];
      return [{ lesson: [1], content: arr }];
    };

    const videosLinksNormalized = videosLinksIncoming !== undefined ? normalizeToLessonArray(videosLinksIncoming) : undefined;
    const externalLinksNormalized = externalLinksIncoming !== undefined ? normalizeToLessonArray(externalLinksIncoming) : undefined;
    const referenceLinksNormalized = referenceLinksIncoming !== undefined ? normalizeToLessonArray(referenceLinksIncoming) : undefined;
    const assessmentLinksNormalized = assessmentLinksIncoming !== undefined ? normalizeToLessonArray(assessmentLinksIncoming) : undefined;

    // -------------------
    // Files handling: We expect:
    // - req.body.filesMeta (JSON): [{ lesson: [n], filename: "name.ext" }, ...]
    // - req.body.filesLessonsShape (JSON): [{ lesson: [n], existingContent: [ "url1", ... ] }, ...]
    // - req.files['files'] contains the uploaded File objects
    // We'll:
    //  1. parse filesLessonsShape to get base existingContent per lesson (this reflects removals done client-side)
    //  2. upload new files and append URLs to the corresponding lessons based on filesMeta mapping
    //  3. enforce <=5 files per lesson rule
    // -------------------
    const filesLessonsShapeRaw = req.body.filesLessonsShape;
    let filesLessonsShape = [];
    if (filesLessonsShapeRaw) {
      if (typeof filesLessonsShapeRaw === "string") {
        try {
          filesLessonsShape = JSON.parse(filesLessonsShapeRaw);
        } catch {
          filesLessonsShape = [];
        }
      } else if (Array.isArray(filesLessonsShapeRaw)) {
        filesLessonsShape = filesLessonsShapeRaw;
      }
    }

    // Build a lesson map from filesLessonsShape: lessonNum -> array of existing urls
    const lessonMap = new Map();
    (filesLessonsShape || []).forEach((entry) => {
      const lessonNum = Array.isArray(entry.lesson) ? Number(entry.lesson[0]) : Number(entry.lesson || 1);
      const arr = Array.isArray(entry.existingContent) ? entry.existingContent.slice() : [];
      lessonMap.set(String(lessonNum), arr);
    });

    // If there was no filesLessonsShape provided, fallback to existing course.files minus removed urls,
    // grouped by lesson numbers in course.files (legacy behavior)
    if ((!filesLessonsShape || filesLessonsShape.length === 0) && Array.isArray(course.files)) {
      course.files.forEach((fEntry) => {
        const ln = Array.isArray(fEntry.lesson) ? Number(fEntry.lesson[0]) : Number(fEntry.lesson || 1);
        const key = String(ln);
        if (!lessonMap.has(key)) lessonMap.set(key, []);
        (fEntry.content || []).forEach((url) => {
          // don't include URLs flagged for removal
          if (!filesToRemove.includes(url)) lessonMap.get(key).push(url);
        });
      });
    }

    // -------------------
    // Handle uploaded files mapping using filesMeta
    // -------------------
    const filesMetaRaw = req.body.filesMeta;
    let filesMeta = [];
    if (filesMetaRaw) {
      if (typeof filesMetaRaw === "string") {
        try {
          filesMeta = JSON.parse(filesMetaRaw);
        } catch {
          filesMeta = [];
        }
      } else if (Array.isArray(filesMetaRaw)) {
        filesMeta = filesMetaRaw;
      }
    }

    // We'll keep track of newly uploaded URLs so we can rollback on validation error
    const newlyUploadedUrls = [];

    if (req.files && Array.isArray(req.files["files"]) && req.files["files"].length > 0) {
      // Create a shallow copy of filesMeta to mutate
      const metaPool = Array.isArray(filesMeta) ? filesMeta.slice() : [];

      for (const file of req.files["files"]) {
        // Find a matching meta entry by filename (originalname). If multiple metas match same name,
        // take first one.
        let assignedMetaIndex = metaPool.findIndex(m => m && m.filename === file.originalname);

        // If not found, fallback to take next available meta (if any)
        if (assignedMetaIndex === -1 && metaPool.length > 0) {
          assignedMetaIndex = 0;
        }

        let assignedLesson = 1; // default fallback
        if (assignedMetaIndex !== -1) {
          const assignedMeta = metaPool[assignedMetaIndex];
          assignedLesson = Array.isArray(assignedMeta.lesson) ? Number(assignedMeta.lesson[0]) : Number(assignedMeta.lesson || 1);
          // remove used meta to avoid reusing
          metaPool.splice(assignedMetaIndex, 1);
        } else {
          // no meta info, fallback to lesson 1
          assignedLesson = 1;
        }

        // Upload the file to firebase
        try {
          const uploadedUrl = await handleFirebaseUpload(file, "Files", `Course-${course.title}-file`);
          newlyUploadedUrls.push(uploadedUrl);
          const key = String(assignedLesson);
          if (!lessonMap.has(key)) lessonMap.set(key, []);
          lessonMap.get(key).push(uploadedUrl);
        } catch (uploadErr) {
          // If upload fails, rollback any previous uploads for this request
          await Promise.all(newlyUploadedUrls.map(u => deleteFromFirebase(u).catch(() => {})));
          console.error("File upload failed:", uploadErr);
          return next(Boom.internal("Failed to upload files."));
        }
      }
    }

    // -------------------
    // Enforce max 5 files per lesson (server-side)
    // -------------------
    for (const [lessonKey, arr] of lessonMap.entries()) {
      if ((arr || []).length > 5) {
        // Rollback newly uploaded files before returning error
        if (newlyUploadedUrls.length) {
          await Promise.all(newlyUploadedUrls.map(u => deleteFromFirebase(u).catch(() => {})));
        }
        return next(Boom.badRequest(`Lesson ${lessonKey} has ${arr.length} files — max 5 allowed per lesson.`));
      }
    }

    // -------------------
    // Build final course.files array from lessonMap (sorted by lesson number)
    // -------------------
    const finalFilesArray = Array.from(lessonMap.entries())
      .map(([ln, urls]) => ({ lesson: [Number(ln)], content: urls }))
      .sort((a, b) => (a.lesson[0] - b.lesson[0]));

    course.files = finalFilesArray;

    // -------------------
    // Overwrite link arrays with normalized lesson-shaped payloads if provided.
    // If incoming normalization produced undefined (field not present), keep existing.
    // -------------------
    if (videosLinksNormalized !== undefined) course.videosLinks = videosLinksNormalized;
    if (externalLinksNormalized !== undefined) course.externalLinks = externalLinksNormalized;
    if (referenceLinksNormalized !== undefined) course.referenceLinks = referenceLinksNormalized;
    if (assessmentLinksNormalized !== undefined) course.assessmentLinks = assessmentLinksNormalized;

    // -------------------
    // Save and respond
    // -------------------
    const saved = await course.save();
    return res.json(saved);
  } catch (error) {
    console.error("Error updating course:", error);
    // Attempt best-effort rollback of any uploaded files referenced in request (if present)
    // Note: in normal failure path above we already tried to rollback; this is a final safety.
    // (If you want strict rollback, track newly uploaded file URLs in outer scope.)
    return next(Boom.internal("Error updating course."));
  }
};



/**
 * Delete an existing course by ID.
 * Also removes its thumbnail + files from Firebase storage,
 * then deletes the Mongo document and cleans up user references
 */
export const deleteCourse = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    if (!courseId) {
      return next(Boom.badRequest("Course ID is required for deletion."));
    }

    // 1) Fetch the course so we know what to delete
    const course = await Course.findById(courseId);
    if (!course) {
      return next(Boom.notFound("Course not found."));
    }

    // 2) Delete its thumbnail from GCS (if present)
    if (course.thumbnail) {
      try {
        await deleteFromFirebase(course.thumbnail);
      } catch (err) {
        console.warn("Failed to delete thumbnail from GCS:", err);
      }
    }

    // 3) Delete each file in course.files from GCS
    if (Array.isArray(course.files) && course.files.length) {
      await Promise.all(
        course.files.map(async (fileUrl) => {
          try {
            await deleteFromFirebase(fileUrl);
          } catch (err) {
            console.warn("Failed to delete file from GCS:", fileUrl, err);
          }
        })
      );
    }

    // 4) Now remove the Course document itself
    await Course.findByIdAndDelete(courseId);

    // 5) Remove course references from all users
    await User.updateMany(
      { courses: courseId },
      { $pull: { courses: courseId } }
    );

    // 6) Send a "course deleted" notification to everyone
    const notificationData = `Course '${course.title}' has been deleted.`;
    const users = await User.find({}, "_id");
    if (users.length) {
      const bulkOps = users.map((u) => ({
        updateOne: {
          filter: { user: u._id },
          update: {
            $setOnInsert: { user: u._id },
            $push: {
              type: { $each: ["coursedelete"] },
              data: { $each: [notificationData] }
            }
          },
          upsert: true
        }
      }));
      await Notification.bulkWrite(bulkOps);
    }

    return res.status(200).json({
      success: true,
      message: "Course and all attachments deleted successfully."
    });
  } catch (error) {
    console.error("Error deleting course:", error);
    return next(Boom.internal("Error deleting course."));
  }
};



/**
 * Get a course by its ID.
 */
export const getCourseById = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);

    if (!course) {
      return next(Boom.notFound("Course not found."));
    }

    res.json(course);
  } catch (error) {
    console.error("Error fetching course:", error);
    next(Boom.internal("Error fetching course."));
  }
};

/**
 * Get all courses.
 */
export const getAllCourses = async (req, res, next) => {
  try {
    const courses = await Course.find({});
    res.json(courses);
  } catch (error) {
    console.error("Error fetching courses:", error);
    next(Boom.internal("Error fetching courses."));
  }
};

export const getAllCoursesAdmin = async (req, res, next) => {
  try {
    const courses = await Course.find({});
    res.json(courses);
  } catch (error) {
    console.error("Error fetching courses:", error);
    next(Boom.internal("Error fetching courses."));
  }
};

export const updateCoursesPrice = async (req, res, next) => {
  try {
    const { courseIds, newPrice } = req.body;
    const updated = await Course.updateMany(
      { _id: { $in: courseIds } },
      { $set: { price: newPrice } }
    );
    res.json({ message: "Courses updated successfully.", updated });
  } catch (error) {
    console.error("Error updating courses price:", error);
    next(Boom.internal("Error updating courses price."));
  }
};


/**
 * Update status of multiple courses.
 * Expects req.body.courseIds (array of IDs) and req.body.newStatus (boolean).
 */
export const updateCourseStatus = async (req, res, next) => {
  try {
    const { courseIds, newStatus } = req.body;
    const updated = await Course.updateMany(
      { _id: { $in: courseIds } },
      { $set: { status: newStatus } }
    );
    res.json({ message: "Course status updated successfully.", updated });
  } catch (error) {
    console.error("Error updating course status:", error);
    next(Boom.internal("Error updating course status."));
  }
};

/**
 * Get courses by category.
 */
export const getCoursesByCategory = async (req, res, next) => {
  try {
    const { category } = req.params;
    const courses = await Course.find({ courseCategory: category });
    res.json(courses);
  } catch (error) {
    console.error("Error fetching courses by category:", error);
    next(Boom.internal("Error fetching courses by category."));
  }
};

export const getAllUserCourses = async (req, res, next) => {
  try {
    const courses = await Course.find({ status: true }).select(
      "title Author thumbnail courseCategory shortdescription status price"
    );
    res.json(courses);
  } catch (error) {
    console.error("Error fetching courses:", error);
    next(Boom.internal("Error fetching courses."));
  }
};

export const getCoursesByIds = async (req, res, next) => {
  try {
    const { courseIds } = req.body; // Expecting an array of course IDs in the request body


    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({ success: false, message: "courseIds array is required." });
    }

    // Fetch courses with matching IDs
    const courses = await Course.find({
      _id: { $in: courseIds },
      status: true, // Optional: Only return active/published courses
    }).select("title Author thumbnail courseCategory shortdescription status price");

    return res.status(200).json({ success: true, courses });
  } catch (error) {
    console.error("❌ Error fetching courses by IDs:", error);
    return next(Boom.internal("Error fetching user courses."));
  }
};


export default {
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseById,
  getAllCourses,
  getAllUserCourses,
  updateCourseStatus,
  getCoursesByCategory,
  updateCoursesPrice,
  getCoursesByIds,
};
