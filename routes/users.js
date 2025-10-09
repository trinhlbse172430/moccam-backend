const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Users API is working!");
});

/**
 * 📌 Lấy tất cả người dùng
 * GET /api/users
 */
router.get("/", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const pool = await poolPromise;
    // 💡 Tối ưu: Chỉ chọn các trường cần thiết, loại bỏ password để tăng bảo mật
    const result = await pool.request().query(`
      SELECT user_id, email, full_name, date_of_birth, picture, phone_number, role, created_at 
      FROM Users
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /users:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 Lấy người dùng theo ID
 * GET /api/users/:id
 */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const pool = await poolPromise;

    // ❗ Nếu không phải admin, chỉ được xem chính mình
    if (req.user.role !== "admin" && req.user.user_id != req.params.id) {
      return res.status(403).json({ message: "You are not allowed to view other people's information" });
    }

    const result = await pool.request()
      .input("user_id", sql.Int, req.params.id)
      .query(`
        SELECT user_id, full_name, email, phone_number, role, date_of_birth, picture 
        FROM Users 
        WHERE user_id = @user_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "User does not exist" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /users/:id:", err.message);
    res.status(500).send("Server error");
  }
});


/**
 * 📌 Thêm người dùng mới
 * POST /api/users/create
 */
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { password, email, full_name, phone_number, role, date_of_birth, picture } = req.body;

  if (!password || !email || !full_name || !phone_number || !role) {
    return res.status(400).json({
      message: "Missing required fields: password, email, full_name, phone_number, role"
    });
  }

  try {
    const pool = await poolPromise;

    // 🔹 Kiểm tra email trùng
    const checkEmail = await pool.request()
      .input("email", sql.VarChar(50), email)
      .query("SELECT COUNT(*) AS count FROM Users WHERE email = @email");

    if (checkEmail.recordset[0].count > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // 🔹 Kiểm tra số điện thoại trùng
    const checkPhone = await pool.request()
      .input("phone_number", sql.VarChar(10), phone_number)
      .query("SELECT COUNT(*) AS count FROM Users WHERE phone_number = @phone_number");

    if (checkPhone.recordset[0].count > 0) {
      return res.status(400).json({ message: "Phone number already exists" });
    }
    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);
    // Thêm người dùng mới
    await pool.request()
      .input("email", sql.VarChar(50), email)
      .input("password", sql.VarChar(200), hashedPassword)
      .input("full_name", sql.NVarChar(50), full_name)
      .input("phone_number", sql.VarChar(10), phone_number)
      .input("role", sql.VarChar(10), role)
  
      .input("date_of_birth", sql.Date, date_of_birth || null)
      .input("picture", sql.NVarChar(sql.MAX), picture || null)
      .query(`
        INSERT INTO Users (email, password, full_name, phone_number, role, date_of_birth, picture, created_at)
        VALUES (@email, @password, @full_name, @phone_number, @role, @date_of_birth, @picture, GETDATE())
      `);

    res.status(201).json({ message: "✅ User added successfully" });
  } catch (err) {
    console.error("❌ Error in POST /users:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 Cập nhật người dùng
 * PUT /api/users/:id
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  const { full_name, email, phone_number, role, password, date_of_birth, picture } = req.body;

  // 💡 Cải tiến: Không bắt buộc phải gửi tất cả các trường
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json({ message: "No fields to update provided" });
  }

  try {
    const pool = await poolPromise;

    // 🔹 Kiểm tra email trùng (nếu có gửi email)
    if (email) {
      const checkEmail = await pool.request()
        .input("email", sql.VarChar(50), email)
        .input("user_id", sql.Int, req.params.id)
        .query("SELECT COUNT(*) AS count FROM Users WHERE email = @email AND user_id != @user_id");
      if (checkEmail.recordset[0].count > 0) {
        return res.status(400).json({ message: "Email already exists" });
      }
    }

    // 🔹 Kiểm tra số điện thoại trùng (nếu có gửi sđt)
    if (phone_number) {
        const checkPhone = await pool.request()
          .input("phone_number", sql.VarChar(10), phone_number)
          .input("user_id", sql.Int, req.params.id)
          .query("SELECT COUNT(*) AS count FROM Users WHERE phone_number = @phone_number AND user_id != @user_id");
        if (checkPhone.recordset[0].count > 0) {
          return res.status(400).json({ message: "Phone number already exists" });
        }
    }
    
    // 💡 Cải tiến: Xây dựng câu lệnh UPDATE động
    const setClauses = [];
    const request = pool.request().input("user_id", sql.Int, req.params.id);

    if (full_name) { setClauses.push("full_name = @full_name"); request.input("full_name", sql.NVarChar(50), full_name); }
    if (email) { setClauses.push("email = @email"); request.input("email", sql.VarChar(50), email); }
    if (phone_number) { setClauses.push("phone_number = @phone_number"); request.input("phone_number", sql.VarChar(10), phone_number); }
    if (role) { setClauses.push("role = @role"); request.input("role", sql.VarChar(10), role); }
    if (date_of_birth) { setClauses.push("date_of_birth = @date_of_birth"); request.input("date_of_birth", sql.Date, date_of_birth); }
    if (picture) { setClauses.push("picture = @picture"); request.input("picture", sql.NVarChar(sql.MAX), picture); }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      setClauses.push("password = @password");
      request.input("password", sql.VarChar(200), hashedPassword);
    }
    
    if (setClauses.length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
    }

    const query = `UPDATE Users SET ${setClauses.join(", ")} WHERE user_id = @user_id`;
    const result = await request.query(query);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "✅ User updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /users/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 Xóa người dùng
 * DELETE /api/users/:id
 */
router.delete("/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("user_id", sql.Int, req.params.id)
      .query("DELETE FROM Users WHERE user_id = @user_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "✅ User deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /users/:id:", err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;
