import express from "express";
import multer from "multer";
import path from "path";

const router = express.Router();

import Product from "../controllers/product";
import grantAccess from "../middlewares/grantAccess";
import { verifyAccessToken } from "../helpers/jwt";

// Set up Multer storage configuration
const storage = multer.memoryStorage(); // Use memory storage instead

const upload = multer({ storage: storage });


// Middleware to handle different types of uploads
const handleUploads = upload.fields([
  { name: 'displayPhoto'},
  { name: 'frontPhoto' },
  { name: 'backPhoto' },
  { name: 'productPhotos'},
  { name: 'colorPhotos'},
  { name: 'frontdisplayPhoto'},
  { name: 'backdisplayPhoto'},
]);

const editUploads = upload.fields([
  { name: 'displayPhoto'},
  { name: 'frontPhoto' },
  { name: 'backPhoto' },
  { name: 'productPhotos'},
  { name: 'colorPhotos'},
  { name: 'frontdisplayPhoto'},
  { name: 'backdisplayPhoto'},
]);


// Endpoint to create a product with image uploads
router.post(
  "/",
  verifyAccessToken,
  grantAccess("createAny", "product"),
  handleUploads,
  Product.Create  // Controller to handle the product creation logic
);
router.post(
  "/update-sale",
  verifyAccessToken,                // Middleware to verify the access token
  grantAccess("updateAny", "product"), // Middleware to check permissions
  Product.updateSale                // Call the updateSale method from the Product controller
);
router.post(
  "/update-saleunits",
  verifyAccessToken,                // Middleware to verify the access token
  grantAccess("updateAny", "product"), // Middleware to check permissions
  Product.setUnits                // Call the updateSale method from the Product controller
);
router.post(
  "/update-status",
  verifyAccessToken,                // Middleware to verify the access token
  grantAccess("updateAny", "product"), // Middleware to check permissions
  Product.ActiveStatus                // Call the updateSale method from the Product controller
);

router.post(
  "/fetch-products-by-ids", // Add your new endpoint here
  verifyAccessToken,         // Middleware to verify the access token
  Product.fetchProductsByIds // Use the fetchProductsByIds controller function
);

router.get("/", Product.GetList);
router.get("/completelist", Product.GetCompleteList);
router.get("/bynew", Product.fetchProductsByNew);
router.get("/bysold", Product.fetchTopProductsBySold);
router.get("/daysale", Product.fetchProductsByDaySale);
router.get("/menproducts", Product.fetchProductsByMen);
router.get("/womenproducts", Product.fetchProductsByWomen);
router.get("/totalcount", Product.GetTotalCount);
router.get(
  "/:product_id",
  Product.Get
);

router.put(
  "/:product_id",
  verifyAccessToken,
  grantAccess("updateAny", "product"),
  editUploads,  // Include this middleware to handle file uploads
  Product.Update  // Call the Update method from the Product controller
);

router.delete("/:product_id", Product.Delete);

export default router;
