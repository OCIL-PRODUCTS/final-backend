import Product from "../../models/product";
import Boom from "@hapi/boom"; // Preferred
import ProductSchema from "./validations";
const { v4: uuidv4 } = require("uuid");
const admin = require("firebase-admin");
const { Types: mongooseTypes } = require("mongoose");
const ntc = require("ntc");
const sharp = require("sharp");
// Firebase setup
admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

const bucket = admin.storage().bucket();

// Function to upload files to Firebase and get the public URL
const handleFirebaseUpload = async (file, folder, nameFormat) => {
  const fileName = `${nameFormat}-${uuidv4()}-${file.originalname}`; // Create a unique file name
  const blob = bucket.file(`${folder}/${fileName}`);
  const blobStream = blob.createWriteStream({
    resumable: false,
    metadata: {
      contentType: file.mimetype,
    },
  });

  return new Promise((resolve, reject) => {
    blobStream.on('error', (error) => {
      reject(error);
    });

    blobStream.on('finish', async () => {
      // Updated URL to include the folder name
      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(folder + '/' + fileName)}?alt=media`;
      resolve(publicUrl);
    });

    blobStream.end(file.buffer);
  });
};

const Create = async (req, res, next) => {
  // Validate the product details excluding files
  const { 
    title, 
    shortDescription, 
    longDescription, 
    price, 
    season, 
    gender, 
    category, 
    S, 
    M, 
    L, 
    XL, 
    XXL,  
    sold, 
    colorcode,
    sizechart,
    colorname,
    sale,
    salestatus,
    activestatus 
  } = req.body;
  

  // Validate the product details using the schema

  try {
    // Get the last added product based on the gender
    let prefix = gender === 'Women' ? 'W-' : 'M-';
    let startingNumber = gender === 'Women' ? 2000 : 1000;

    const lastProduct = await Product.findOne({ gender })
      .sort({ myid: -1 })
      .select('myid');

    let newId;

    if (lastProduct && lastProduct.myid) {
      const lastIdNumber = parseInt(lastProduct.myid.split('-')[1]);
      newId = `${prefix}${lastIdNumber + 1}`;
    } else {
      newId = `${prefix}${startingNumber}`;
    }

    // Step 4: Handle file uploads to Firebase
    const displayPhotoNames = req.files['displayPhoto'] 
      ? req.files['displayPhoto'].map((_, index) => `Inrange-${title}-display${index + 1}`) // Create name formats
      : [];

    const displayPhoto = req.files['displayPhoto'] 
      ? await Promise.all(req.files['displayPhoto'].map((file, index) => handleFirebaseUpload(file, 'DisplayPhoto', displayPhotoNames[index]))) 
      : [];

    const frontPhotodisplayNames = req.files['frontdisplayPhoto'] 
      ? req.files['frontdisplayPhoto'].map((_, index) => `Inrange-${title}-display${index + 1}`) // Create name formats
      : [];

    const frontPhotodisplay = req.files['frontdisplayPhoto'] 
      ? await Promise.all(req.files['frontdisplayPhoto'].map((file, index) => handleFirebaseUpload(file, 'FrontDisplayPhoto', frontPhotodisplayNames[index]))) 
      : [];

    const backPhotodisplayNames = req.files['backdisplayPhoto'] 
      ? req.files['backdisplayPhoto'].map((_, index) => `Inrange-${title}-display${index + 1}`) // Create name formats
      : [];

    const backPhotodisplay = req.files['backdisplayPhoto'] 
      ? await Promise.all(req.files['backdisplayPhoto'].map((file, index) => handleFirebaseUpload(file, 'BackDisplayPhoto', backPhotodisplayNames[index]))) 
      : [];
  
    const productPhotoNames = req.files['productPhotos'] 
      ? req.files['productPhotos'].map((_, index) => `Inrange-${title}-product${index + 1}`)
      : [];
    
    const productPhotos = req.files['productPhotos'] 
      ? await Promise.all(req.files['productPhotos'].map((file, index) => handleFirebaseUpload(file, 'ProductPhotos', productPhotoNames[index]))) 
      : [];
    
    const resizedColorPhotoNames = req.files['colorPhotos']
      ? req.files['colorPhotos'].map((_, index) => `Inrange-${title}-color${index + 1}`)
      : [];
    
    const resizedColorPhotos = req.files['colorPhotos']
      ? await Promise.all(req.files['colorPhotos'].map((file, index) => handleFirebaseUpload(file, 'ColorPhotos', resizedColorPhotoNames[index]))) 
      : [];
    
    const frontPhotoNames = req.files['frontPhoto']
      ? req.files['frontPhoto'].map((_, index) => `Inrange-${title}-color${index + 1}`)
      : [];
    
    const frontPhoto = req.files['frontPhoto'] 
    ? await Promise.all(req.files['frontPhoto'].map((file, index) => handleFirebaseUpload(file, 'FrontPhoto', frontPhotoNames[index]))) 
    : [];

    const backPhotoNames = req.files['backPhoto']
      ? req.files['backPhoto'].map((_, index) => `Inrange-${title}-color${index + 1}`)
      : [];
    
    const backPhoto = req.files['backPhoto'] 
    ? await Promise.all(req.files['backPhoto'].map((file, index) => handleFirebaseUpload(file, 'BackPhoto', backPhotoNames[index]))) 
    : [];

    // Step 6: Create a new product instance with Firebase URLs and generated myid
    const product = new Product({
      myid: newId,
      title,
      shortDescription,
      longDescription,
      price,
      season,
      gender,
      category,
      activestatus,
      sizechart,
      S: Array.isArray(S) ? S : [], 
      M: Array.isArray(M) ? M : [], 
      L: Array.isArray(L) ? L : [], 
      XL: Array.isArray(XL) ? XL : [], 
      XXL: Array.isArray(XXL) ? XXL : [], 
      sold,
      colorcode: Array.isArray(colorcode) ? colorcode : [], 
      colorname: Array.isArray(colorname) ? colorname : [], 
      sale,
      salestatus,
      displayPhoto,
      frontdisplayPhoto: frontPhotodisplay,
      backdisplayPhoto :backPhotodisplay,
      productPhotos: productPhotos.slice(0, 4), // Only take the first 4 photos for productPhotos
      colorPhotos: resizedColorPhotos, // Add resized color photos
      frontPhoto, // Add front photo
      backPhoto, // Add back photo
    });

    // Save the product to MongoDB
    const savedData = await product.save();

    res.json(savedData);
  } catch (e) {
    console.error("Error creating product: ", e);
    next(e);
  }
};


const Get = async (req, res, next) => {
  const { product_id } = req.params;

  // Check if product_id is provided
  if (!product_id) {
    return next(Boom.badRequest("Missing parameter (:product_id)"));
  }

  try {
    const product = await Product.findById(product_id);

    if (!product) {
      return next(Boom.notFound("Product not found."));
    }

    res.json(product);
  } catch (e) {
    console.error("Error fetching product:", e); // Log the error
    next(Boom.internal("Internal server error"));
  }
};

const Update = async (req, res, next) => {
  const { product_id } = req.params;

  // Validate the product details excluding files
  const {
      title,
      shortDescription,
      longDescription,
      price,
      season,
      gender,
      category,
      S,
      M,
      L,
      XL,
      XXL,
      sold,
      colorcode,  // This could be a string or an array
      colorname,
      sale,
      salestatus,
      activestatus,
      updateColorRemove,
      updateColor,
      updateColorSizes,
      updateSizes,
      updatedfrontPhotoIndices,
      colorIndices,
      updatedbackPhotoIndices,
      updatedcolorPhotoIndices,
      updatedPhotoIndices,
      sizechart,
      updatePhotoRemove,
  } = req.body;
  
  // Ensure colorcode is an array
  const colorcodeArray = Array.isArray(colorcode) ? colorcode : [colorcode];
  let colornameArray = Array.isArray(colorname) ? colorname : [colorname];
  const S_array =  Array.isArray(S) ? S : [S];
  const M_array =  Array.isArray(M) ? M : [M];
  const L_array =  Array.isArray(L) ? L : [L];
  const XL_array= Array.isArray(XL) ? XL : [XL];
  const XXL_array= Array.isArray(XXL) ? XXL : [XXL];
  colornameArray = colorcodeArray.map((hex) => {
    const color = ntc.name(hex); // Use ntc to convert hex to color name
    return color[1].toLowerCase();
  });
  // Validate the product details using the schema

  try {
      // Fetch the existing product to retain any existing image URLs
      const existingProduct = await Product.findById(product_id);
      if (!existingProduct) {
          return next(Boom.notFound("Product not found."));
      }

      // Initialize display photos
      let existingdisplayPhoto = existingProduct.displayPhoto; // Initialize displayPhoto with two elements
      let existingproductPhotos = existingProduct.productPhotos || [];
      let resizedColorPhotos = existingProduct.colorPhotos || [];
      let existingfrontPhoto = existingProduct.frontPhoto;
      let existingbackPhoto = existingProduct.backPhoto;
      let existingfrontdisplayPhoto = existingProduct.frontdisplayPhoto;
      let existingbackdisplayPhoto = existingProduct.backdisplayPhoto;
      let updatedColorIndices = 0;
      let updatedPhoto = updatedPhotoIndices;
      

      // Check and upload new display photo
      if (req.files['colorPhotos']) {
        const files = req.files['colorPhotos'];
        // Ensure unique and sorted array of indices for banner photos
        const uniqueIndexes = [...new Set(updatedcolorPhotoIndices)]
          .filter(index => !isNaN(index) && index !== ',' && Number.isInteger(Number(index))) // Remove invalid values
          .sort((a, b) => a - b);
      
        const filesToUpdate = files.slice(0, uniqueIndexes.length); // Extract files based on the number of unique indexes
      
        for (let i = 0; i < uniqueIndexes.length; i++) {
          const index = uniqueIndexes[i];
          const file = filesToUpdate[i]; // Get the file for this unique index
  
          if (existingdisplayPhoto[index-1]) {
            await deleteFromFirebase(existingdisplayPhoto[index-1]);
          }    
          if (resizedColorPhotos[index-1]) {
            await deleteFromFirebase(resizedColorPhotos[index-1]);
          }  
          
          
          let resizedBuffer1, resizedBuffer2;
          resizedBuffer1 = await sharp(file.buffer)
            .rotate()
            .resize(1200, 1200, {
              fit: 'fill',
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .jpeg({ quality: 100 })
            .toBuffer();
      
          const resizedFile = {
            buffer: resizedBuffer1,
            originalname: file.originalname,
            mimetype: 'image/jpeg' // Set mimetype to 'image/jpeg' or use original mimetype
          };

          resizedBuffer2 = await sharp(file.buffer)
            .rotate()
            .resize(280, 280, {
              fit: 'fill',
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .jpeg({ quality: 100 })
            .toBuffer();
      
          const resizedFile2 = {
            buffer: resizedBuffer2,
            originalname: file.originalname,
            mimetype: 'image/jpeg'
          };
      
          // Upload the resized image to Firebase
          const uploadedPhoto2 = await handleFirebaseUpload(resizedFile2, 'DisplayPhoto', `Inrange-display-photo-${index}`);
          resizedColorPhotos[index-1] = uploadedPhoto2; // Update at the specific index
          const uploadedPhoto1 = await handleFirebaseUpload(resizedFile, 'ColorPhotos', `Inrange-color-photo-${index}`);
          
          existingdisplayPhoto[index-1] = uploadedPhoto1; // Update at the specific index
        }
      } ;

      if (req.files['frontPhoto']) {
        const files = req.files['frontPhoto'];
        // Ensure unique and sorted array of indices for banner photos
        const uniqueIndexes = [...new Set(updatedfrontPhotoIndices)]
          .filter(index => !isNaN(index) && index !== ',' && Number.isInteger(Number(index))) // Remove invalid values
          .sort((a, b) => a - b);
      
        const filesToUpdate = files.slice(0, uniqueIndexes.length); // Extract files based on the number of unique indexes
      
        for (let i = 0; i < uniqueIndexes.length; i++) {
          const index = uniqueIndexes[i];
          const file = filesToUpdate[i]; // Get the file for this unique index
  
          if (existingfrontPhoto[index-1]) {
            await deleteFromFirebase(existingfrontPhoto[index-1]);
          }    
          if (existingfrontdisplayPhoto[index-1]) {
            await deleteFromFirebase(existingfrontdisplayPhoto[index-1]);
          }  
          // Resize the image using Sharp based on the unique index
          let resizedBuffer1, resizedBuffer2;
          resizedBuffer1 = await sharp(file.buffer)
            .rotate()
            .resize(1200, 1200, {
              fit: 'fill',
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .jpeg({ quality: 100 })
            .toBuffer();
      
          const resizedFile = {
            buffer: resizedBuffer1,
            originalname: file.originalname,
            mimetype: 'image/jpeg' // Set mimetype to 'image/jpeg' or use original mimetype
          };

          resizedBuffer2 = await sharp(file.buffer)
            .rotate()
            .resize(280, 280, {
              fit: 'fill',
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .jpeg({ quality: 100 })
            .toBuffer();
      
          const resizedFile2 = {
            buffer: resizedBuffer2,
            originalname: file.originalname,
            mimetype: 'image/jpeg'
          };
      
          // Upload the resized image to Firebase
          const uploadedPhoto2 = await handleFirebaseUpload(resizedFile2, 'FrontDisplayPhoto', `Inrange-displayfront-photo-${index}`);
          existingfrontdisplayPhoto[index-1] = uploadedPhoto2; // Update at the specific index
          const uploadedPhoto1 = await handleFirebaseUpload(resizedFile, 'FrontPhoto', `Inrange-front-photo-${index}`);
          
          existingfrontPhoto[index-1] = uploadedPhoto1; // Update at the specific index
        }
      } ;

      if (req.files['backPhoto']) {
        const files = req.files['backPhoto'];
        // Ensure unique and sorted array of indices for banner photos
        const uniqueIndexes = [...new Set(updatedbackPhotoIndices)]
          .filter(index => !isNaN(index) && index !== ',' && Number.isInteger(Number(index))) // Remove invalid values
          .sort((a, b) => a - b);
      
        const filesToUpdate = files.slice(0, uniqueIndexes.length); // Extract files based on the number of unique indexes
      
        for (let i = 0; i < uniqueIndexes.length; i++) {
          const index = uniqueIndexes[i];
          const file = filesToUpdate[i]; // Get the file for this unique index
  
          if (existingfrontPhoto[index-1]) {
            await deleteFromFirebase(existingbackPhoto[index-1]);
          }    
          if (existingbackdisplayPhoto[index-1]) {
            await deleteFromFirebase(existingbackdisplayPhoto[index-1]);
          }  
          // Resize the image using Sharp based on the unique index
          let resizedBuffer1, resizedBuffer2;
          resizedBuffer1 = await sharp(file.buffer)
            .rotate()
            .resize(1200, 1200, {
              fit: 'fill',
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .jpeg({ quality: 100 })
            .toBuffer();
      
          const resizedFile = {
            buffer: resizedBuffer1,
            originalname: file.originalname,
            mimetype: 'image/jpeg' // Set mimetype to 'image/jpeg' or use original mimetype
          };

          resizedBuffer2 = await sharp(file.buffer)
            .rotate()
            .resize(280, 280, {
              fit: 'fill',
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .jpeg({ quality: 100 })
            .toBuffer();
      
          const resizedFile2 = {
            buffer: resizedBuffer2,
            originalname: file.originalname,
            mimetype: 'image/jpeg'
          };
      
          // Upload the resized image to Firebase
          const uploadedPhoto2 = await handleFirebaseUpload(resizedFile2, 'BackDisplayPhoto', `Inrange-displayback-photo-${index}`);
          existingbackdisplayPhoto[index-1] = uploadedPhoto2; // Update at the specific index
          const uploadedPhoto1 = await handleFirebaseUpload(resizedFile, 'BackPhoto', `Inrange-back-photo-${index}`);
          existingbackPhoto[index-1] = uploadedPhoto1; // Update at the specific index
        }
      } ;

      if (req.files['productPhotos']) {
        const files = req.files['productPhotos'];
        // Ensure unique and sorted array of indices for banner photos
        const uniqueIndexes = [...new Set(updatedPhotoIndices)]
          .filter(index => !isNaN(index) && index !== ',' && Number.isInteger(Number(index))) // Remove invalid values
          .sort((a, b) => a - b);
      
        const filesToUpdate = files.slice(0, uniqueIndexes.length); // Extract files based on the number of unique indexes
      
        for (let i = 0; i < uniqueIndexes.length; i++) {
          const index = uniqueIndexes[i];
          const file = filesToUpdate[i]; // Get the file for this unique index
  
          if (existingproductPhotos[index-1]) {
            await deleteFromFirebase(existingproductPhotos[index-1]);
          } 
          // Resize the image using Sharp based on the unique index
          let resizedBuffer;
          resizedBuffer = await sharp(file.buffer)
            .rotate()
            .resize(1200, 1200, {
              fit: 'fill',
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .jpeg({ quality: 100 })
            .toBuffer();
      
          const resizedFile = {
            buffer: resizedBuffer,
            originalname: file.originalname,
            mimetype: 'image/jpeg' // Set mimetype to 'image/jpeg' or use original mimetype
          };
      
          const uploadedPhoto1 = await handleFirebaseUpload(resizedFile, 'ProductPhotos', `Inrange-product-photo-${index}`);
          existingproductPhotos[index-1] = uploadedPhoto1; // Update at the specific index
        }
      } ;

      if (updatePhotoRemove) {
        // Ensure unique and sorted array of indices
        const uniqueIndexes = [...new Set(updatePhotoRemove)]
          .filter(index => !isNaN(index) && Number.isInteger(Number(index))) // Ensure valid indices
          .sort((a, b) => b - a); // Sort in descending order to safely remove items
      
        for (const index of uniqueIndexes) {
          const adjustedIndex = index - 1; // Convert to zero-based index
      
          // Check if the index is valid in existingproductPhotos
          if (adjustedIndex >= 0 && adjustedIndex < existingproductPhotos.length) {
            const photoUrl = existingproductPhotos[adjustedIndex];
            
            // If the photo exists, delete it from Firebase
            if (photoUrl) {
              await deleteFromFirebase(photoUrl);
            }
      
            existingproductPhotos.splice(adjustedIndex, 1);
          } else {
            console.warn(`Index ${adjustedIndex} is out of bounds for existingproductPhotos.`);
          }
        }
      }
      
      
      // Ensure frontPhoto is at index 1 of displayPhoto
      

      // Update product details
      const updatedProduct = {
          title,
          shortDescription,
          longDescription,
          price,
          season,
          gender,
          category,
          S: S_array,
          M: M_array,
          L: L_array,
          XL: XL_array,
          XXL: XXL_array,
          sold,
          colorcode: colorcodeArray, // Use the new array
          colorname: colornameArray,
          sale,
          salestatus,
          activestatus,
          displayPhoto:existingdisplayPhoto,
          productPhotos:existingproductPhotos,
          colorPhotos: resizedColorPhotos,
          frontPhoto:existingfrontPhoto,
          backPhoto:existingbackPhoto,
          frontdisplayPhoto:existingfrontdisplayPhoto,
          backdisplayPhoto:existingbackdisplayPhoto,
      };

      const updated = await Product.findByIdAndUpdate(product_id, updatedProduct, {
          new: true,
          runValidators: true, // Ensure validation schema is applied
      });

      if (!updated) {
          return next(Boom.notFound("Product not found."));
      }

      res.json(updated);
  } catch (e) {
      console.error("Error updating product: ", e);
      next(Boom.internal("Internal server error"));
  }
};

const deleteFromFirebase = async (photoUrl) => {
  try {
    const decodedUrl = decodeURIComponent(photoUrl);
    const pathStartIndex = decodedUrl.indexOf('/o/') + 3;
    const pathEndIndex = decodedUrl.indexOf('?alt=media');
    const filePath = decodedUrl.slice(pathStartIndex, pathEndIndex);

    // Ensure the filePath is correctly pointing to one of the intended folders
    if (
      !filePath.startsWith('DisplayPhoto/') &&
      !filePath.startsWith('ColorPhotos/') &&
      !filePath.startsWith('FrontPhoto/') &&
      !filePath.startsWith('FrontDisplayPhoto/') &&
      !filePath.startsWith('BackDisplayPhoto/') &&
      !filePath.startsWith('BackPhoto/') &&
      !filePath.startsWith('ProductPhotos/')
    ) {
      throw new Error("Invalid file path detected. Check folder name or URL format.");
      return;
    }

    // Attempt to delete the file from Firebase storage
    const file = bucket.file(filePath);
    await file.delete();
  } catch (error) {
    console.error(`Error deleting file from Firebase Storage:`, error);
  }
};

const updateSale = async (req, res, next) => {
  // Destructure the nested productIds properly
  const { productIds, salePercentage, saleStartDate, saleEndDate, S, M, L, XL, XXL } = req.body.productIds;
  let salestatus;

  try {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: "No product IDs provided." });
    }

    // Convert salePercentage to a number (in case it's a string) and check for invalid value
    const salePercentageNum = salePercentage !== null ? parseFloat(salePercentage) : NaN;

    const objectIds = productIds.map(id => new mongooseTypes.ObjectId(id));
    const products = await Product.find({ _id: { $in: objectIds } });

    // Helper function to assign sale values based on product color length
    const assignSaleValues = (sizeArray, colorCount) => {
      const assignedValues = sizeArray.slice(-colorCount);  // Get values from the end of the array
      const remainingValues = sizeArray.slice(0, sizeArray.length - colorCount);   // Remove those assigned values
      return { assignedValues, remainingValues };
    };

    let remainingS = S, remainingM = M, remainingL = L, remainingXL = XL, remainingXXL = XXL;

    // Updated products with sale info
    const updatedProducts = products.map((product) => {
      const saleAmount = (product.price * salePercentageNum) / 100;

      // Convert the sale start date to Pakistan time
      let startDate = new Date(saleStartDate).toLocaleString("en-US", { 
        timeZone: "Asia/Karachi", 
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }); 
      
      let endDate = new Date(saleEndDate).toLocaleString("en-US", { 
        timeZone: "Asia/Karachi", 
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      let nowInPakistan = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Karachi",
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      // Convert date to correct format: YYYY-MM-DD
      startDate = new Date(startDate).toISOString().split('T')[0];  // Converts to YYYY-MM-DD
      endDate = new Date(endDate).toISOString().split('T')[0];  // Converts to YYYY-MM-DD
      nowInPakistan = new Date(nowInPakistan).toISOString().split('T')[0];  // Converts to YYYY-MM-DD
      
      function addOneDay(date) {
        const newDate = new Date(date);
        newDate.setDate(newDate.getDate() + 1);  // Add 1 day
        return newDate.toISOString().split('T')[0];  // Convert to YYYY-MM-DD
      }
      
      startDate = addOneDay(new Date(startDate));  // Add 1 day to startDate
      endDate = addOneDay(new Date(endDate));  // Add 1 day to endDate
      nowInPakistan = addOneDay(new Date(nowInPakistan));  // Add 1 day to nowInPakistan
      
      // Check if salePercentageNum is valid and if the sale is active based on the date
      if (isNaN(salePercentageNum) || salePercentageNum === 0) {
        salestatus = "Inactive";
      } else if (startDate > nowInPakistan) {
        salestatus = "Upcoming Sale";
      } else if (startDate <= nowInPakistan && endDate >= nowInPakistan) {
        salestatus = "Active";
      } else {
        salestatus = "Inactive";
      }
      
      // Check if sizes are null and update sale status accordingly
      const isSizeNull = [S, M, L, XL, XXL].every(size => size === null);
      if (isSizeNull && (isNaN(salePercentageNum) || salePercentageNum === 0)) {
        salestatus = "Inactive"; 
      } else if(isSizeNull && endDate === startDate && startDate === nowInPakistan)
      {
        salestatus = "DayDeal";
      }
       else if (isSizeNull && endDate === startDate) {
        salestatus = "Upcoming-DayDeal";
      } else if (endDate === startDate) {
        salestatus = "Upcoming-DayDeal-Quantity";
      } else if (startDate <= nowInPakistan && endDate >= nowInPakistan) {
        salestatus = "Active";
      } else if (isSizeNull) {
        salestatus = "Upcoming-Active";
      } else {
        salestatus = "Upcoming-Active-Quantity";
      }
      

      // Prepare the sale values based on size (S, M, L, XL, XXL)
      const sizeSale = {
        sale_S: 0, // Default size arrays with null values if arrays are missing
        sale_M: 0,
        sale_L: 0,
        sale_XL: 0,
        sale_XXL: 0,
      };

      // Check if sizes are provided, then assign values
      if (S) {
        const { assignedValues, remainingValues } = assignSaleValues(remainingS, product.colorname.length);
        sizeSale.sale_S = assignedValues;
        remainingS = remainingValues;
      }

      if (M) {
        const { assignedValues, remainingValues } = assignSaleValues(remainingM, product.colorname.length);
        sizeSale.sale_M = assignedValues;
        remainingM = remainingValues;
      }

      if (L) {
        const { assignedValues, remainingValues } = assignSaleValues(remainingL, product.colorname.length);
        sizeSale.sale_L = assignedValues;
        remainingL = remainingValues;
      }

      if (XL) {
        const { assignedValues, remainingValues } = assignSaleValues(remainingXL, product.colorname.length);
        sizeSale.sale_XL = assignedValues;
        remainingXL = remainingValues;
      }

      if (XXL) {
        const { assignedValues, remainingValues } = assignSaleValues(remainingXXL, product.colorname.length);
        sizeSale.sale_XXL = assignedValues;
        remainingXXL = remainingValues;
      }

      if (salestatus === "Inactive") {
        startDate = null;
        endDate = null;
      }

      return {
        ...product._doc,
        sale: salePercentageNum > 0 ? product.price - saleAmount : product.price,
        salestatus: salestatus,
        salestart: startDate,
        saleend: endDate,
        ...sizeSale,
      };
    });

    const updated = await Product.bulkWrite(
      updatedProducts.map((product) => {
        if (product.salestatus === "Inactive") {
          product.sale = 0;
        }
        return {
          updateOne: {
            filter: { _id: product._id },
            update: {
              sale: Math.ceil(product.sale),
              salestatus: product.salestatus,
              salestart: product.salestart,
              saleend: product.saleend,
              sale_S: product.sale_S,
              sale_M: product.sale_M,
              sale_L: product.sale_L,
              sale_XL: product.sale_XL,
              sale_XXL: product.sale_XXL,
            },
          },
        };
      })
    );

    res.json({ message: "Sale updated successfully.", updated });
  } catch (e) {
    console.error("Error updating sale: ", e);
    next(e);
  }
};

const setUnits = async (req, res, next) => {
  const { productIds, units, salePercentage } = req.body; 
  

  try {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: "No product IDs provided." });
    }

    const objectIds = productIds.map(id => new mongooseTypes.ObjectId(id));
    const products = await Product.find({ _id: { $in: objectIds } });

    const updatedProducts = products.map(product => {
      const updatedProduct = { ...product._doc };

      // Update sizes (S, M, L, XL, XXL) with the corresponding units, or set to null if salePercentage is 0
      if (salePercentage > 0) {
        if (units.S) updatedProduct.sale_S = units.S;
        if (units.M) updatedProduct.sale_M = units.M;
        if (units.L) updatedProduct.sale_L = units.L;
        if (units.XL) updatedProduct.sale_XL = units.XL;
        if (units.XXL) updatedProduct.sale_XXL = units.XXL;
      } else {
        // Set units to null if no sale is applied
        updatedProduct.sale_S = null;
        updatedProduct.sale_M = null;
        updatedProduct.sale_L = null;
        updatedProduct.sale_XL = null;
        updatedProduct.sale_XXL = null;
      }

      return updatedProduct;
    });

    const updated = await Product.bulkWrite(
      updatedProducts.map(product => ({
        updateOne: {
          filter: { _id: product._id },
          update: {
            sale_S: product.sale_S,
            sale_M: product.sale_M,
            sale_L: product.sale_L,
            sale_XL: product.sale_XL,
            sale_XXL: product.sale_XXL
          },
        },
      }))
    );

    res.json({ message: "Product units updated successfully.", updated });
  } catch (e) {
    console.error("Error updating units: ", e);
    next(e);
  }
};


// Inside the Product controller
const ActiveStatus = async (req, res, next) => {
  const { productIds } = req.body.productIds; // Ensure this line reflects your input structure
  

  try {
    // Ensure that productIds is an array and has at least one product
    if (!Array.isArray(productIds) || productIds.length === 0) {
      
      return res.status(400).json({ message: "No product IDs provided." });
    }

    // Convert productIds to ObjectId format
    const objectIds = productIds.map(id => new mongooseTypes.ObjectId(id)); // Use 'new' to instantiate ObjectId

    // Find products by ObjectId
    const products = await Product.find({ _id: { $in: objectIds } });

    // Calculate the sale amount based on the percentage
    const updatedProducts = products.map(product => {
      const newStatus = product.activestatus === "Active" ? "Inactive" : "Active";
      return {
        ...product._doc, // Use _doc to get the plain object
        activestatus: newStatus,
      };
    });

    // Update each product with the new sale details
    const updated = await Product.bulkWrite(
      updatedProducts.map(product => ({
        updateOne: {
          filter: { _id: product._id },
          update: {
            activestatus: product.activestatus,
          },
        },
      }))
    );

    res.json({ message: "Updated successfully.", updated });
  } catch (e) {
    console.error("Error updating sale: ", e);
    next(e);
  }
};

const Delete = async (req, res, next) => {
  const { product_id } = req.params;

  try {
    // Fetch the product to get the associated image URLs
    const product = await Product.findById(product_id);

    if (!product) {
      throw Boom.notFound("Product not found.");
    }

    // Collect all the photos from the product model
    const filesToDelete = [
      ...product.displayPhoto,
      ...product.productPhotos,
      ...product.frontdisplayPhoto,
      ...product.backdisplayPhoto,
      ...product.colorPhotos,
      ...product.frontPhoto,
      ...product.backPhoto,
    ];

    // Remove any null or undefined values from the file array
    const validFilesToDelete = filesToDelete.filter(file => file);
    await Promise.all(
      validFilesToDelete.map(fileUrl => deleteFromFirebase(fileUrl))
    );

    const deleted = await Product.findByIdAndDelete(product_id);

    if (!deleted) {
      throw Boom.notFound("Product not found.");
    }
    res.json(deleted);
  } catch (e) {
    console.error("Error deleting product: ", e);
    next(e);
  }
};

const GetCompleteList = async (req, res, next) => {
  try {
    const products = await Product.find({}).sort({ createdAt: -1 });
    res.json(products);
  } catch (e) {
    next(e);
  }
};

const GetList = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1; // Get page number from query or default to 1
    const limit = parseInt(req.query.limit) || 12; // Get limit from query or default to 12

    const products = await Product.find({})
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit) // Skip previous pages' products
      .limit(limit); // Limit the number of products to the specified limit

    res.json(products);
  } catch (e) {
    next(e);
  }
};

const GetTotalCount = async (req, res, next) => {
  try {
    const totalCount = await Product.countDocuments();
    res.json({ totalCount });
  } catch (e) {
    next(e);
  }
};

const fetchProductsByIds = async (req, res) => {
  const { ids } = req.body; // Expecting an array of IDs in the request body

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Invalid IDs provided.' });
  }

  try {
    // Fetch products matching the provided IDs
    const products = await Product.find({ _id: { $in: ids } });

    // Check if any products were found
    if (products.length === 0) {
      return res.status(404).json({ message: 'No products found for the provided IDs.' });
    }

    return res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ message: 'Server error while fetching products.' });
  }
};

const fetchProductsByDaySale = async (req, res) => {
  try {
    const products = await Product.find({
      salestatus: { $in: ['DayDeal', 'DayDeal-Quantity'] } // Only filter by 'DayDeal' sale status
    });
    
    // Check if any products were found
    if (products.length === 0) {
      return null;
    }

    return res.status(200).json(products);
  } catch (error) {
    return null;
  }
};

const fetchTopProductsBySold = async (req, res) => {
  try {
    // Fetch products sorted by sold in descending order and limit to top 10
    const products = await Product.find()
      .sort({ sold: -1 }) // Sort by sold value in descending order
      .limit(10); // Limit to top 10 products

    // Check if any products were found
    if (products.length === 0) {
      return res.status(404).json({ message: 'No products found.' });
    }

    // Return the products and gender
    return res.status(200).json({ products });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ message: 'Server error while fetching products.' });
  }
};


const fetchProductsByNew = async (req, res) => {
  try {
    // Fetch the 8 latest products based on the creation date
    const products = await Product.find({})
      .sort({ createdAt: -1 }) // Sort by creation date in descending order
      .limit(8); // Limit to 8 products

    // Check if any products were found
    if (products.length === 0) {
      return res.status(404).json({ message: 'No products found.' });
    }

    return res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ message: 'Server error while fetching products.' });
  }
};

const fetchProductsByMen = async (req, res) => {
  try {
    // Fetch products where gender is "Men"
    const products = await Product.aggregate([
      { $match: { gender: 'Men' } },  // Filter products by gender "Men"
      { $sample: { size: 100 } }      // Sample a larger number of products (e.g., 100)
    ]);

    // If fewer than 10 products are available, return whatever is available
    const limitedProducts = products.slice(0, 10); // Limit to 10 products or fewer

    // Check if any products were found
    if (limitedProducts.length === 0) {
      return res.status(404).json({ message: 'No products found.' });
    }
    
    return res.status(200).json(limitedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ message: 'Server error while fetching products.' });
  }
};

const fetchProductsByWomen = async (req, res) => {
  try {
    // Fetch products where gender is "Men"
    const products = await Product.aggregate([
      { $match: { gender: 'Women' } },  // Filter products by gender "Men"
      { $sample: { size: 100 } }      // Sample a larger number of products (e.g., 100)
    ]);

    // If fewer than 10 products are available, return whatever is available
    const limitedProducts = products.slice(0, 10); // Limit to 10 products or fewer

    // Check if any products were found
    if (limitedProducts.length === 0) {
      return res.status(404).json({ message: 'No products found.' });
    }

    return res.status(200).json(limitedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ message: 'Server error while fetching products.' });
  }
};


export default {
  Create,
  Get,
  Update,
  Delete,
  GetList,
  updateSale,
  GetTotalCount,
  GetCompleteList,
  ActiveStatus,
  fetchProductsByIds,
  setUnits,
  fetchProductsByDaySale,
  fetchProductsByNew,
  fetchTopProductsBySold,
  fetchProductsByMen,
  fetchProductsByWomen,
};
