import { CatchAsyncError } from "./catchAsyncError.js";
import jwt from "jsonwebtoken";
import ErrorHandler from "../utils/ErrorHandler.js";
import userModel from "../models/user.model.js";
import { updateAccessToken } from "../controllers/user.controller.js";
export const isAuthenticated = CatchAsyncError(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const ACCESS_TOKEN_SECRET = authHeader?.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : req.cookies.ACCESS_TOKEN_SECRET;
    if (!ACCESS_TOKEN_SECRET) {
        return next(new ErrorHandler("Please login to access this resource", 401));
    }
    console.log("ACCESS TOKEN:", ACCESS_TOKEN_SECRET);
    try {
        const decoded = jwt.verify(ACCESS_TOKEN_SECRET, process.env.ACCESS_TOKEN_SECRET);
        const user = await userModel.findById(decoded.id);
        if (!user)
            return next(new ErrorHandler("User not found", 404));
        req.user = user;
        next();
    }
    catch (error) {
        if (error.name === "TokenExpiredError") {
            return updateAccessToken(req, res, next);
        }
        console.log(error);
        return next(new ErrorHandler("Invalid access token", 401));
    }
});
export const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user?.role) {
            return next(new ErrorHandler("User role is not defined", 400));
        }
        if (!roles.includes(req.user.role)) {
            return next(new ErrorHandler(`Role: ${req.user.role} is not allowed to access this resource`, 403));
        }
        next();
    };
};
