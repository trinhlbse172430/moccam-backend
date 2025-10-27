const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const { OAuth2Client } = require("google-auth-library");

require("dotenv").config();


const generateToken = (user) => {
    return jwt.sign(
        { id: user.user_id, name: user.full_name, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || "1d" }
    );
};

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post("/register/customer", async (req, res) => {
    const { password, email, full_name, phone_number, picture, date_of_birth } = req.body;
    const role = "customer"; // Luôn là customer

    if (!password || !email || !full_name || !phone_number) {
        return res.status(400).json({ message: "Thiếu trường bắt buộc: password, email, full_name, phone_number" });
    }

    try {
        // Kiểm tra email trùng
        const [emailRows] = await pool.query("SELECT user_id FROM Users WHERE email = ?", [email]);
        if (emailRows.length > 0) {
            return res.status(400).json({ message: "Email đã tồn tại" });
        }

        // Kiểm tra phone trùng (chỉ nếu được cung cấp)
        if (phone_number) {
            const [phoneRows] = await pool.query("SELECT user_id FROM Users WHERE phone_number = ?", [phone_number]);
            if (phoneRows.length > 0) {
                return res.status(400).json({ message: "Số điện thoại đã tồn tại" });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Chèn user mới
        const sqlQuery = `
            INSERT INTO Users (email, password, full_name, phone_number, role, picture, date_of_birth, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW()) 
        `;
        await pool.query(sqlQuery, [
            email, hashedPassword, full_name, phone_number || null, role, picture || null, date_of_birth || null
        ]);

        res.status(201).json({ message: "✅ Đăng ký khách hàng thành công" });

    } catch (err) {
        console.error("❌ Lỗi đăng ký customer:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});


router.post("/register/user", async (req, res) => {
    const { password, email, full_name, phone_number, role, picture, date_of_birth } = req.body;

    if (!password || !email || !full_name || !phone_number || !role) {
        return res.status(400).json({ message: "Thiếu trường bắt buộc: password, email, full_name, phone_number, role" });
    }

    try {
        const [emailRows] = await pool.query("SELECT user_id FROM Users WHERE email = ?", [email]);
        if (emailRows.length > 0) return res.status(400).json({ message: "Email đã tồn tại" });

        if (phone_number) {
            const [phoneRows] = await pool.query("SELECT user_id FROM Users WHERE phone_number = ?", [phone_number]);
            if (phoneRows.length > 0) return res.status(400).json({ message: "Số điện thoại đã tồn tại" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const sqlQuery = `
            INSERT INTO Users (email, password, full_name, phone_number, role, picture, date_of_birth, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        await pool.query(sqlQuery, [
            email, hashedPassword, full_name, phone_number || null, role, picture || null, date_of_birth || null
        ]);

        res.status(201).json({ message: "✅ Đăng ký người dùng thành công" });

    } catch (err) {
        console.error("❌ Lỗi đăng ký user:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});



router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Thiếu email hoặc mật khẩu" });

    try {
        const [rows] = await pool.query("SELECT * FROM Users WHERE email = ?", [email]);
        const user = rows[0];

        if (!user) return res.status(400).json({ message: "Email không tồn tại" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Sai mật khẩu" });

        const token = generateToken(user);

        res.json({
            message: "✅ Đăng nhập thành công",
            token,
            user: { id: user.user_id, full_name: user.full_name, email: user.email, role: user.role },
        });
    } catch (err) {
        console.error("❌ Lỗi đăng nhập:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});


router.post("/google-login", async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "Thiếu Google token" });

    try {
        const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        const { email, name, picture } = payload; // Lấy thêm picture từ Google

        const [rows] = await pool.query("SELECT * FROM Users WHERE email = ?", [email]);
        let user;
        let loginMessage;
        let isNewUser;

        if (rows.length > 0) {
            user = rows[0];
            loginMessage = "✅ Chào mừng bạn quay trở lại!";
            isNewUser = false;
        } else {
            const sqlQuery = `
                INSERT INTO Users (email, password, full_name, phone_number, role, picture, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
            `;
            // Dùng placeholder cho password để phân biệt
            const [insertResult] = await pool.query(sqlQuery, [email, 'SOCIAL_LOGIN', name, null, 'customer', picture || null]);
            
            // Lấy lại thông tin user vừa tạo
            const [newUserRows] = await pool.query("SELECT * FROM Users WHERE user_id = ?", [insertResult.insertId]);
            user = newUserRows[0];
            loginMessage = "✅ Tạo tài khoản mới qua Google thành công!";
            isNewUser = true;
        }

        const appToken = generateToken(user);

        res.json({
            message: loginMessage,
            token: appToken,
            isNewUser: isNewUser,
            user: { id: user.user_id, full_name: user.full_name, email: user.email, role: user.role },
        });
    } catch (err) {
        console.error("❌ Lỗi Google login:", err.message);
        // Phân biệt lỗi token và lỗi server
        if (err.message.includes('audience') || err.message.includes('token')) {
             res.status(401).json({ message: "Invalid Google token" });
        } else {
             res.status(500).json({ message: "Lỗi máy chủ" });
        }
    }
});



router.post("/reset-password", async (req, res) => {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ message: "Thiếu email hoặc mật khẩu mới." });
    if (newPassword.length < 6) return res.status(400).json({ message: "Mật khẩu mới phải dài ít nhất 6 ký tự." });

    try {
        const [rows] = await pool.query("SELECT user_id FROM Users WHERE email = ?", [email]);
        if (rows.length === 0) return res.status(404).json({ message: "Email không tồn tại." });

        const userId = rows[0].user_id;
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        await pool.query("UPDATE Users SET password = ? WHERE user_id = ?", [hashedNewPassword, userId]);

        res.json({ message: "✅ Cập nhật mật khẩu thành công." });

    } catch (err) {
        console.error("❌ Lỗi reset mật khẩu:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});


module.exports = router;