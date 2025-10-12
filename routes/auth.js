const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sql, poolPromise } = require("../db");
require("dotenv").config();

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: API cho việc đăng ký, đăng nhập và xác thực người dùng
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - full_name
 *         - phone_number
 *       properties:
 *         email:
 *           type: string
 *           example: "user@example.com"
 *         password:
 *           type: string
 *           example: "123456"
 *         full_name:
 *           type: string
 *           example: "Nguyen Van A"
 *         phone_number:
 *           type: string
 *           example: "0912345678"
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           example: "user@example.com"
 *         password:
 *           type: string
 *           example: "123456"
 *     AuthResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "✅ Login successful"
 *         token:
 *           type: string
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 1
 *             full_name:
 *               type: string
 *               example: "Nguyen Van A"
 *             email:
 *               type: string
 *               example: "user@example.com"
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterRequest1:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - full_name
 *         - phone_number
 *         - role
 *       properties:
 *         email:
 *           type: string
 *           example: "employee@example.com"
 *         password:
 *           type: string
 *           example: "123456"
 *         full_name:
 *           type: string
 *           example: "Nguyen Van A"
 *         phone_number:
 *           type: string
 *           example: "0912345679"
 *         role:
 *           type: string
 *           example: "employee"
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           example: "employee@example.com"
 *         password:
 *           type: string
 *           example: "123456"
 *     AuthResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "✅ Login successful"
 *         token:
 *           type: string
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 2
 *             full_name:
 *               type: string
 *               example: "Nguyen Van A"
 *             email:
 *               type: string
 *               example: "employee@example.com"
 *             role:
 *               type: string
 *               example: "employee"
 */

// ✅ Hàm tạo token JWT
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.user_id,
      name: user.full_name,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || "1d" }
  );
};

/**
 * @swagger
 * /api/auth/register/customer:
 *   post:
 *     summary: Đăng ký người dùng mới
 *     tags: [Authentication]
 *     requestBody:
 *       description: Thông tin người dùng cần thiết để đăng ký
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 message: "✅ Customer registered successfully"
 *       400:
 *         description: Thiếu thông tin hoặc email/số điện thoại đã tồn tại
 *       500:
 *         description: Lỗi máy chủ
 */
// ✅ REGISTER Customer
router.post("/register/customer", async (req, res) => {
  const { password, email, full_name, phone_number, picture, date_of_birth } = req.body;

  if (!password || !email || !full_name || !phone_number) {
    return res.status(400).json({
      message:
        "Missing required fields: password, email, full_name, phone_number",
    });
  }

  try {
    const pool = await poolPromise;

    // Kiểm tra email trùng
    const checkEmail = await pool
      .request()
      .input("email", sql.VarChar(50), email)
      .query("SELECT COUNT(*) AS count FROM Users WHERE email = @email");
    if (checkEmail.recordset[0].count > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Kiểm tra phone trùng
    const checkPhone = await pool
      .request()
      .input("phone_number", sql.VarChar(10), phone_number)
      .query("SELECT COUNT(*) AS count FROM Users WHERE phone_number = @phone_number");
    if (checkPhone.recordset[0].count > 0) {
      return res.status(400).json({ message: "Phone number already exists" });
    }

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // Thêm user
    await pool
      .request()
      .input("email", sql.VarChar(50), email)
      .input("password", sql.VarChar(200), hashedPassword)
      .input("full_name", sql.NVarChar(50), full_name)
      .input("phone_number", sql.VarChar(10), phone_number)
      .input("role", sql.VarChar(10), "customer")
      .input("picture", sql.VarChar(MAX), picture || null)
      .input("date_of_birth", sql.Date, date_of_birth || null)
      .query(`
        INSERT INTO Users (email, password, full_name, phone_number, role, picture, date_of_birth, created_at)
        VALUES (@email, @password, @full_name, @phone_number, @role, @picture, @date_of_birth, GETDATE())
      `);

    res.status(201).json({ message: "✅ Customer registered successfully" });
  } catch (err) {
    console.error("❌ Error in REGISTER:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/auth/register/user:
 *   post:
 *     summary: Đăng ký nhân viên hoặc quản trị viên mới
 *     tags: [Authentication]
 *     requestBody:
 *       description: Thông tin cần thiết để đăng ký
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest1'
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 message: "✅ User registered successfully"
 *       400:
 *         description: Thiếu thông tin hoặc email/số điện thoại trùng
 *       500:
 *         description: Lỗi máy chủ
 */
// ======================
// ✅ REGISTER USER (DÙNG CHO EMPLOYEE VÀ ADMIN)
// ======================
router.post("/register/user", async (req, res) => {
  const { password, email, full_name, phone_number, role, picture, date_of_birth } = req.body;

  if (!password || !email || !full_name || !phone_number || !role) {
    return res.status(400).json({
      message:
        "Missing required fields: password, email, full_name, phone_number, role",
    });
  }

  try {
    const pool = await poolPromise;

    // Kiểm tra email trùng
    const checkEmail = await pool
      .request()
      .input("email", sql.VarChar(50), email)
      .query("SELECT COUNT(*) AS count FROM Users WHERE email = @email");
    if (checkEmail.recordset[0].count > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Kiểm tra phone trùng
    const checkPhone = await pool
      .request()
      .input("phone_number", sql.VarChar(10), phone_number)
      .query("SELECT COUNT(*) AS count FROM Users WHERE phone_number = @phone_number");
    if (checkPhone.recordset[0].count > 0) {
      return res.status(400).json({ message: "Phone number already exists" });
    }

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // Thêm user
    await pool
      .request()
      .input("email", sql.VarChar(50), email)
      .input("password", sql.VarChar(200), hashedPassword)
      .input("full_name", sql.NVarChar(50), full_name)
      .input("phone_number", sql.VarChar(10), phone_number)
      .input("role", sql.VarChar(10), role)
      .input("picture", sql.VarChar(MAX), picture || null)
      .input("date_of_birth", sql.Date, date_of_birth || null)
      .query(`
        INSERT INTO Users (email, password, full_name, phone_number, role, picture, date_of_birth, created_at)
        VALUES (@email, @password, @full_name, @phone_number, @role, @picture, @date_of_birth, GETDATE())
      `);

    res.status(201).json({ message: "✅ User registered successfully" });
  } catch (err) {
    console.error("❌ Error in REGISTER:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập bằng email và mật khẩu
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Đăng nhập thành công, trả về token và thông tin user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Email không tồn tại
 *       401:
 *         description: Sai mật khẩu
 *       500:
 *         description: Lỗi máy chủ
 */

// ✅ LOGIN USER
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Missing email or password" });

  try {
    const pool = await poolPromise;

    // Kiểm tra email có tồn tại
    const result = await pool
      .request()
      .input("email", sql.VarChar(50), email)
      .query("SELECT * FROM Users WHERE email = @email");

    const user = result.recordset[0];
    if (!user) return res.status(400).json({ message: "Email does not exist" });

    // So sánh mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Incorrect password" });

    // Tạo token
    const token = generateToken(user);

    res.json({
      message: "✅ Login successful",
      token,
      user: {
        id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("❌ Error in LOGIN:", err.message);
    res.status(500).send("Server error");
  }
});


/**
 * @swagger
 * /api/auth/google-login:
 *   post:
 *     summary: Đăng nhập bằng Google OAuth2
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 example: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjE..."
 *     responses:
 *       200:
 *         description: Đăng nhập thành công (có thể tạo tài khoản mới nếu chưa tồn tại)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Thiếu Google token
 *       401:
 *         description: Token không hợp lệ
 *       500:
 *         description: Lỗi máy chủ
 */

// ======================
// ✅ GOOGLE LOGIN
// ======================
const { OAuth2Client } = require("google-auth-library");
const { MAX } = require("mssql");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post("/google-login", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Missing Google token" });
  }

  try {
    // 1️⃣ Xác thực token Google
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name } = payload;

    const pool = await poolPromise;

    // 2️⃣ Kiểm tra user đã tồn tại chưa
    const result = await pool
      .request()
      .input("email", sql.VarChar(50), email)
      .query("SELECT * FROM Users WHERE email = @email");

    let user;

    if (result.recordset.length > 0) {
      user = result.recordset[0];
    } else {
      // 3️⃣ Nếu chưa có, tạo mới user với role mặc định là "customer"
      const insert = await pool
        .request()
        .input("email", sql.VarChar(50), email)
        .input("full_name", sql.NVarChar(50), name)
        .input("phone_number", sql.VarChar(10), "") // chưa có số điện thoại
        .input("password", sql.VarChar(200), "") // chưa có mật khẩu
        .input("role", sql.VarChar(10), "customer")
        .query(`
          INSERT INTO Users (password, email, full_name, phone_number, role, created_at)
          OUTPUT INSERTED.*
          VALUES (@password, @email, @full_name, @phone_number, @role, GETDATE())
        `);
      user = insert.recordset[0];
    }

    // 4️⃣ Tạo token app (JWT nội bộ)
    const appToken = jwt.sign(
      {
        id: user.user_id,
        name: user.full_name,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "1d" }
    );

    res.json({
      message: "✅ Google login successful",
      token: appToken,
      user: {
        id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("❌ Google login error:", err.message);
    res.status(401).json({ message: "Invalid Google token" });
  }
});


module.exports = router;
