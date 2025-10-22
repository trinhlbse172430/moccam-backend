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
 *     RegisterCustomerRequest:
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
 *         picture:
 *           type: string
 *           example: "https://example.com/avatar.png"
 *         date_of_birth:
 *           type: string
 *           format: date
 *           example: "2000-05-20"
 *
 *     RegisterUserRequest:
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
 *           example: "Tran Thi B"
 *         phone_number:
 *           type: string
 *           example: "0987654321"
 *         role:
 *           type: string
 *           enum: [admin, employee]
 *           example: "employee"
 *         picture:
 *           type: string
 *           example: "https://example.com/staff.png"
 *
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
 *
 *     GoogleLoginRequest:
 *       type: object
 *       required:
 *         - token
 *       properties:
 *         token:
 *           type: string
 *           example: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjE..."
 *
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
 *             role:
 *               type: string
 *               example: "customer"
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
 *     summary: 👤 Đăng ký tài khoản khách hàng (Customer)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       description: Thông tin người dùng để đăng ký tài khoản khách hàng
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterCustomerRequest'
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *         content:
 *           application/json:
 *             example:
 *               message: "✅ Customer registered successfully"
 *       400:
 *         description: Email hoặc số điện thoại đã tồn tại
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
 *     summary: 🧑‍💼 Đăng ký tài khoản nhân viên hoặc quản trị viên
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       description: Thông tin người dùng và vai trò
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterUserRequest'
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *         content:
 *           application/json:
 *             example:
 *               message: "✅ User registered successfully"
 *       400:
 *         description: Email hoặc số điện thoại trùng lặp
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

/* =======================================================
   🟢 POST /api/auth/login
   → Đăng nhập người dùng (Customer / Employee / Admin)
=========================================================*/
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: 🔑 Đăng nhập hệ thống
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       description: Email và mật khẩu người dùng
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
 *         description: Mật khẩu sai
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
 *     summary: 🔐 Đăng nhập bằng Google OAuth2
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       description: Google token sau khi xác thực
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GoogleLoginRequest'
 *     responses:
 *       200:
 *         description: Đăng nhập thành công (tự động tạo tài khoản mới nếu chưa tồn tại)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Thiếu hoặc token không hợp lệ
 *       401:
 *         description: Token Google không hợp lệ
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
    const ticket = await client.verifyIdToken({
       idToken: token,
       audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  const { email, name } = payload;

  const pool = await poolPromise;

  const result = await pool
  .request()
  .input("email", sql.VarChar(50), email)
  .query("SELECT * FROM Users WHERE email = @email");

  let user;
   let loginMessage;
    let isNewUser;

  if (result.recordset.length > 0) {
    user = result.recordset[0];
    loginMessage = "✅ Chào mừng bạn quay trở lại!";
    isNewUser = false;
  } else {
    const insert = await pool
    .request()
    .input("email", sql.VarChar(50), email)
    .input("full_name", sql.NVarChar(50), name)
    .input("phone_number", sql.VarChar(10), null)
    .input("password", sql.VarChar(200), "GOOGLE_USER_PASSWORD")
    .input("role", sql.VarChar(10), "customer")
    .query(`
      INSERT INTO Users (password, email, full_name, phone_number, role, created_at)
      OUTPUT INSERTED.*
      VALUES (@password, @email, @full_name, @phone_number, @role, GETDATE())
      `);
    user = insert.recordset[0];
    loginMessage = "✅ Tạo tài khoản mới qua Google thành công!";
    isNewUser = true;
}

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
    message: loginMessage,
    token: appToken,
    isNewUser: isNewUser,
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

// Reset Password
router.post("/reset-password", async (req, res) => {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
        return res.status(400).json({ message: "Missing email or new password." });
    }

    // Nên thêm validation cơ bản cho mật khẩu mới (ví dụ: độ dài tối thiểu)
    if (newPassword.length < 6) {
         return res.status(400).json({ message: "New password must be at least 6 characters long." });
    }

    try {
        const pool = await poolPromise;

        // 1. Kiểm tra xem email có tồn tại không
        const userResult = await pool.request()
            .input("email", sql.VarChar(50), email)
            .query("SELECT user_id FROM Users WHERE email = @email");

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ message: "Email not found." });
        }

        const userId = userResult.recordset[0].user_id;

        // 2. Hash mật khẩu mới
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // 3. Cập nhật mật khẩu trong database
        await pool.request()
            .input("user_id", sql.Int, userId)
            .input("password", sql.VarChar(200), hashedNewPassword)
            .query("UPDATE Users SET password = @password WHERE user_id = @user_id");

        res.json({ message: "✅ Password updated successfully." });

    } catch (err) {
        console.error("❌ Error in insecure password reset:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
