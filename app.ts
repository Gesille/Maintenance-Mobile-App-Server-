import express,{NextFunction, Request, Response} from "express";
export const app = express();
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from 'express-rate-limit'
import { ErrorMiddleware } from "./middleware/error.js";

import dotenv from "dotenv";
import userRouter from "./routes/user.route.js";
dotenv.config();




//body parser
app.use(express.json());

//cookie parser
app.use(cookieParser());

//cors => cross origin resource sharing 
app.use(cors({
    origin:['http://localhost:3000'],
    credentials: true, 
}));




//api requests limit
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes






	limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
	standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
	// store: ... , // Redis, Memcached, etc. See below.
})

//routes
app.use("/api/v1", userRouter);





//testing api
app.get("/test",( req:Request , res:Response , next : NextFunction) =>{
res.status(200).json({
    success:true,
    message:"API is working!",
  });
});


//unknoun route
app.use((req:Request , res:Response , next:NextFunction) =>{
    const err = new Error(`Route ${req.originalUrl} not found`) as any;
    err.statusCode =404;
    next(err);
});

//middleware calls
app.use(limiter);

app.use(ErrorMiddleware);