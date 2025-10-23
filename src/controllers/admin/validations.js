import Joi from "joi";

const ValidationSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required().messages({
    "string.empty": "First name is required.",
    "string.min": "First name must be at least 2 characters long.",
    "string.max": "First name cannot exceed 50 characters.",
  }),
  lastName: Joi.string().min(2).max(50).required().messages({
    "string.empty": "Last name is required.",
    "string.min": "Last name must be at least 2 characters long.",
    "string.max": "Last name cannot exceed 50 characters.",
  }),
  username: Joi.string().alphanum().min(3).max(30).required().messages({
    "string.empty": "Username is required.",
    "string.alphanum": "Username must only contain letters and numbers.",
    "string.min": "Username must be at least 3 characters long.",
    "string.max": "Username cannot exceed 30 characters.",
  }),
  email: Joi.string().email().required().messages({
    "string.empty": "Email is required.",
    "string.email": "Invalid email format.",
  }),
  password: Joi.string().min(8).max(30).required().messages({
    "string.empty": "Password is required.",
    "string.min": "Password must be at least 8 characters long.",
    "string.max": "Password cannot exceed 30 characters.",
  }),
  passwordConfirm: Joi.string()
    .valid(Joi.ref("password"))
    .required()
    .messages({
      "string.empty": "Confirm password is required.",
      "any.only": "Passwords must match.",
    }),
  country: Joi.string().required().messages({
    "string.empty": "Country is required.",
  }),
  frontendUrl: Joi.string(),
});

export default ValidationSchema;
