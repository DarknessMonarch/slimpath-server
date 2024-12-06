const express = require("express");
const app = express();
const cors = require("cors");
const path = require("path");
require('dotenv').config({ path: '.env' })
const fetch = require("node-fetch");
const session = require("express-session");
const morgan = require("morgan");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");
const { connectDB } = require("./config/db");
const bodyParser = require("body-parser");
const authRoute = require("./routes/authRoute");
const trackingRoute = require("./routes/trackingRoutes"); 

connectDB();

const PORT = process.env.PORT || 5000;


const corsOptions = {
  origin: 'https://slimpath.vercel.app', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Access-Control-Allow-Credentials'
  ],
  credentials: true,
  optionsSuccessStatus: 200
};


app.use(express.json());
app.use(cors(corsOptions));
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(helmet());
app.use(morgan("dev"));

app.options('/api/v1/auth/profile-image', cors(corsOptions));

// Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_CONNECTION_URL }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);

app.use("/api/v1/auth", authRoute); 
app.use("/api/v1/calories", trackingRoute);

// Serve frontend
app.get("/", (req, res) => {
  const filePath = path.join(__dirname, "client", "index.html");
  res.sendFile(filePath);
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "An unexpected error occurred" });
});

app.listen(PORT, () => {
  console.log(`[+] Server running on port ${PORT}`);
});

process.on("SIGINT", async () => {
  console.log("[-] Sayonara...");
  process.exit(0);
});
