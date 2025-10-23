import Boom from "@hapi/boom"; // Preferred
import User from '../../models/user'; // Adjust path based on your directory structure
const bcrypt = require('bcrypt');

const nodemailer = require("nodemailer");
const crypto = require('crypto'); // For generating a unique verification token

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com', // Hostinger SMTP server
  port: 465,  // Port number for Hostinger SMTP (587 for TLS)
  secure: true,  // TLS/SSL setting (use 'true' for port 465, 'false' for port 587)
  auth: {
    user: "no-reply@openpreneurs.business", // Replace with your Hostinger email
    pass: "1mpactLiv!ng",  // Replace with your email password
  },
});
const verifyEmail = async (req, res, next) => {
  const { token } = req.params;
  try {
      const user = await User.findOne({ verificationToken: token });

      if (!user) {
          return next(Boom.notFound("Verification link is invalid or expired."));
      }

      user.verified = "Yes";
      user.verificationToken = undefined; // Remove the token after verification
      await user.save();

      res.json({ success: true, message: "Your email has been verified successfully!" });
  } catch (error) {
      next(error);
  }
};


const forgotPassword = async (req, res, next) => {
  const  mail = req.body;
  const email = mail.email.email;
  const url =  mail.email.frontendUrl;

  try {
      const user = await User.findOne({ email });
      if (!user) {
          return next(Boom.notFound("User with this email does not exist."));
      }

      // Generate a unique token
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = Date.now() + 3600000; // Token expires in 1 hour
      await user.save();

      // Send reset password email
      const resetLink = `${url}/reset-password/${resetToken}`; // Link should lead to a reset password form
      const mailOptions = {
          from: "no-reply@openpreneurs.business",
          to: email,
          subject: 'Password Reset Request',
          text: `${user.username}, Please click on the following link to reset your password: ${resetLink}`,
      };

      await transporter.sendMail(mailOptions);

      res.json({ message: "A password reset email has been sent to your email address." });
  } catch (error) {
      next(Boom.badImplementation("An error occurred while sending the reset email."));
  }
};

const resetPassword = async (req, res, next) => {
  const { token } = req.params;
  const { newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    return next(Boom.badRequest("Passwords do not match."));
  }

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return next(Boom.notFound("Password reset token is invalid or has expired."));
    }

    // Hash the new password before saving it
    const salt = await bcrypt.genSalt(10);  // Generate salt
    const hashedPassword = await bcrypt.hash(newPassword, salt);  // Hash the new password

    // Update the user's password and clear reset token
    user.password = hashedPassword;  // Store the hashed password
    user.resetPasswordToken = undefined;  // Clear the reset token
    user.resetPasswordExpires = undefined;  // Clear the reset token expiry
    await user.save();  // Save the updated user

    res.json({ message: "Password has been reset successfully!" });
  } catch (error) {
    next(error);  // Pass any error to the error handling middleware
  }
};

const sendContactEmail = async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  const mailOptions = {
    from: "no-reply@openpreneurs.business",
    to: email,  // Replace with the email that should receive messages
    subject: `Contact Us Form: ${subject}`,
    text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: 'Your message has been sent successfully!' });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ message: 'Error sending the message. Please try again later.' });
  }
};

export default {
  verifyEmail,
  forgotPassword,
  resetPassword,
  sendContactEmail,
};
