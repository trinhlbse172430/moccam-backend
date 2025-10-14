const express = require("express");
const app = express();
const PORT = 3000;
const { swaggerUi, specs } = require("./config/swagger");

app.use(express.json());


// Import route Users
const userRoutes = require("./routes/users");
app.use("/api/users", userRoutes);

// Import route Courses
const courseRoutes = require("./routes/courses");
app.use("/api/courses", courseRoutes);

// Import route Lessons
const lessonRoutes = require("./routes/lessons");
app.use("/api/lessons", lessonRoutes);

// Import route Resources
const resourceRoutes = require("./routes/resources");
app.use("/api/resources", resourceRoutes);

// Import route AI Models
const aiModelRoutes = require("./routes/ai_models");
app.use("/api/ai-models", aiModelRoutes);

// Import route Hand Motions
const handMotionRoutes = require("./routes/hand_motions");
app.use("/api/hand-motions", handMotionRoutes);

// Import route Comments
const commentRoutes = require("./routes/comments");
app.use("/api/comments", commentRoutes);

// Import route Customer Progress
const customerProgressRoutes = require("./routes/customer_progress");
app.use("/api/customer-progress", customerProgressRoutes);

// Import route Notifications
const notificationRoutes = require("./routes/notifications");
app.use("/api/notifications", notificationRoutes);

// Import route Subscription Plans
const subscriptionPlanRoutes = require("./routes/subscriptionPlans");
app.use("/api/subscription-plans", subscriptionPlanRoutes);

// Import route User Subscriptions  
const userSubscriptionRoutes = require("./routes/userSubscriptions"); 
app.use("/api/user-subscriptions", userSubscriptionRoutes);

// Import route Vouchers
const voucherRoutes = require("./routes/vouchers");
app.use("/api/vouchers", voucherRoutes);

// Import route Payments
const paymentRoutes = require("./routes/payments");
app.use("/api/payments", paymentRoutes);

// Import route Auth
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

// Import route Leaderboard
const leaderboardRoutes = require("./routes/leaderboard");
app.use("/api", leaderboardRoutes);

// Import route Lesson Progress
const lessonProgressRoutes = require("./routes/lessonProgress");
app.use("/api/lesson-progress", lessonProgressRoutes);

// Import route User Activity Log
const userActivityLogRoutes = require("./routes/userActivityLog");
app.use("/api/activity", userActivityLogRoutes);

// chặn XSS, clickjacking, sniffing
const helmet = require("helmet");
app.use(helmet()); 

// cho phép truy cập từ frontend
const cors = require("cors");
app.use(cors()); 

// giới hạn request
const rateLimit = require("express-rate-limit");
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })); 

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));
//
app.listen(3000, () => {
  console.log("Server running on port 3000");
  console.log("Swagger Docs available at: http://localhost:3000/api-docs");
});

// Test API
app.get("/", (req, res) => {
    res.send("MocCam Backend is running...");
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
