const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// 🔹 Register User & Send Verification Email
const registerUser = async (req, res) => {
  const { first_name, last_name, email, password, role } = req.body;

  if (!["admin", "customer"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex"); // Generate token

    await pool.query(
      `INSERT INTO users (first_name, last_name, email, password, role, is_verified, verification_token) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [first_name, last_name, email, hashedPassword, role, false, verificationToken]
    );

    // Send verification email
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    console.log(verificationLink)
    await sendVerificationEmail(email, verificationLink);

    res.status(201).json({ message: "User registered successfully. Please verify your email." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 🔹 Send Verification Email
const sendVerificationEmail = async (email, link) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  const mailOptions = {
    from: `"TechUdite Support" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Verify Your Email - TechUdite",
    html: `<h2>Welcome to TechUdite!</h2>
           <p>Please click the link below to verify your email:</p>
           <a href="${link}"><strong>Verify Email</strong></a>
           <p>If you did not sign up, ignore this email.</p>`,
  };

  await transporter.sendMail(mailOptions);
};

// 🔹 Verify Email API
const verifyEmail = async (req, res) => {
  const { token } = req.query;

  try {
    const result = await pool.query("SELECT * FROM users WHERE verification_token = $1", [token]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    await pool.query("UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE verification_token = $1", [token]);

    res.json({ message: "Email verified successfully. You can now log in." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 🔹 Login User (Checks Verification Status)
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = userResult.rows[0];

    // 🔹 Check if user has verified their email
    if (!user.is_verified) {
      return res.status(403).json({ error: "Email not verified. Please check your inbox.", emailVerified: false });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      user: { id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { registerUser, loginUser, verifyEmail };
