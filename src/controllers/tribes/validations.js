import Joi from 'joi';

const ProductSchema = Joi.object({
  title: Joi.string().required().messages({
    'any.required': 'Title is required',
  }),
  shortDescription: Joi.string().required().messages({
    'any.required': 'Short description is required',
  }),
  longDescription: Joi.string().required().messages({
    'any.required': 'Long description is required',
  }),
  price: Joi.number().required().positive().messages({
    'any.required': 'Price is required',
    'number.base': 'Price must be a number',
    'number.positive': 'Price must be a positive number',
  }),
  season: Joi.string().allow('').optional(), // Allow empty strings if no special condition
  gender: Joi.string().required().messages({
    'any.required': 'Gender is required',
  }),
  category: Joi.string().required().messages({
    'any.required': 'Category is required',
  }),
  colorcode: Joi.array()
    .items(Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format, must be a valid hex code (e.g., #FFFFFF)'))
    .min(1)
    .required()
    .messages({
      'array.min': 'At least one color is required',
      'any.required': 'Color is required',
      'string.pattern.name': 'Invalid color format, must be a valid hex code (e.g., #FFFFFF)',
    }),
  colorname: Joi.array().items(Joi.any()).optional(),
  S: Joi.array().items(Joi.number().min(0)).default([]), // Array of numbers
  M: Joi.array().items(Joi.number().min(0)).default([]), // Array of numbers
  L: Joi.array().items(Joi.number().min(0)).default([]), // Array of numbers
  XL: Joi.array().items(Joi.number().min(0)).default([]), // Array of numbers
  XXL: Joi.array().items(Joi.number().min(0)).default([]), // Array of numbers
  sold: Joi.string().optional(),
  sale: Joi.number().optional(),
  salestatus: Joi.string().optional(),
  activestatus: Joi.string().optional(), // Optional if no special condition
  displayPhoto: Joi.array().items(Joi.any()).optional(), // No special condition
  productPhotos: Joi.array().items(Joi.any()).optional(), // No special condition
  largePhotos: Joi.array().items(Joi.any()).optional(), // No special condition
});

export default ProductSchema;
