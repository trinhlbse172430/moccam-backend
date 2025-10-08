const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sql, poolPromise } = require("../db");
require("dotenv").config();

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

// ✅ REGISTER USER
router.post("/register", async (req, res) => {
  const { password, email, full_name, phone_number, role } = req.body;

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
      .query(`
        INSERT INTO Users (email, password, full_name, phone_number, role, created_at)
        VALUES (@email, @password, @full_name, @phone_number, @role, GETDATE())
      `);

    res.status(201).json({ message: "✅ User registered successfully" });
  } catch (err) {
    console.error("❌ Error in REGISTER:", err.message);
    res.status(500).send("Server error");
  }
});

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


// ======================
// ✅ GOOGLE LOGIN
// ======================
const { OAuth2Client } = require("google-auth-library");
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
