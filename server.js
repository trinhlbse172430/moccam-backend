const express = require("express");
const cors = require('cors');
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require('dotenv').config(); 

// Import Swagger (giả sử đường dẫn đúng)
const { swaggerUi, specs } = require("./config/swagger");

// Import các router
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const courseRoutes = require("./routes/courses");
const lessonRoutes = require("./routes/lessons");
const resourceRoutes = require("./routes/resources");
const aiModelRoutes = require("./routes/ai_models");
const handMotionRoutes = require("./routes/hand_motions");
const commentRoutes = require("./routes/comments");
const customerProgressRoutes = require("./routes/customer_progress"); 
const notificationRoutes = require("./routes/notifications");
const subscriptionPlanRoutes = require("./routes/subscriptionPlans");
const userSubscriptionRoutes = require("./routes/userSubscriptions");
const voucherRoutes = require("./routes/vouchers");
const paymentRoutes = require("./routes/payments");
const leaderboardRoutes = require("./routes/leaderboard");
const lessonProgressRoutes = require("./routes/lessonProgress");
const userActivityLogRoutes = require("./routes/userActivityLog");
const dashboardRoutes = require("./routes/dashboard");

const app = express();

// --- Middleware Setup ---
// 1. CORS: Cho phép truy cập từ mọi frontend (NÊN đặt đầu tiên)
app.use(cors());

// 2. Helmet: Thêm các header bảo mật cơ bản
app.use(helmet());

// 3. Body Parser: Xử lý request body dạng JSON (Quan trọng: Đặt trước routes)
app.use(express.json());

// 4. Rate Limiter: Giới hạn số lượng request
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 100, // Giới hạn mỗi IP 100 requests mỗi windowMs
    message: "Too many requests from this IP, please try again after 15 minutes"
}));

// --- Routes Setup ---
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/lessons", lessonRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/ai-models", aiModelRoutes);
app.use("/api/hand-motions", handMotionRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/customer-progress", customerProgressRoutes); 
app.use("/api/notifications", notificationRoutes);
app.use("/api/subscription-plans", subscriptionPlanRoutes);
app.use("/api/user-subscriptions", userSubscriptionRoutes);
app.use("/api/vouchers", voucherRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api", leaderboardRoutes); 
app.use("/api/lesson-progress", lessonProgressRoutes);
app.use("/api/activity", userActivityLogRoutes);
app.use("/api/dashboard", dashboardRoutes);

// --- Swagger UI ---
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// --- Test Route ---
app.get("/", (req, res) => {
    res.send("MocCam Backend is running...");
});

// --- Server Listening ---
const PORT = process.env.PORT || 3000; // Sử dụng PORT từ .env hoặc mặc định 3000
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ Swagger Docs available at http://localhost:${PORT}/api-docs`);
});