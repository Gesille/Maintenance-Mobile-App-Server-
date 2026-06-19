import jwt from "jsonwebtoken";
import { CatchAsyncError } from "../middleware/catchAsyncError.js";
import ErrorHandler from "../utils/ErrorHandler.js";
import userModel from "../models/user.model.js";
import sendMail from "../utils/sendMail.js";
import { odooRequest } from "../odoo/odoo.client.js";
import { accessTokenOptions, refreshTokenOptions, sendToken } from "../utils/jwt.js";
import { getAllUsersService, getUserById, updateUserRoleService } from "../services/user.service.js";
import cloudinary from "cloudinary";
export const createActivationToken = (user) => {
    const activationCode = Math.floor(1000 + Math.random() * 9000).toString();
    const token = jwt.sign({
        user,
        activationCode,
    }, process.env.ACTIVATION_SECRET, {
        expiresIn: "5m",
    });
    return { token, activationCode };
};
// Register user controller
export const registrationUser = CatchAsyncError(async (req, res, next) => {
    try {
        const { name, email, password, role = "user" } = req.body;
        if (!name || !email || !password) {
            return next(new ErrorHandler("All fields are required", 400));
        }
        const isEmailExist = await userModel.findOne({ email });
        if (isEmailExist) {
            return next(new ErrorHandler("Email is already exist", 400));
        }
        const user = {
            name,
            email,
            password,
            role,
        };
        const activationToken = createActivationToken(user);
        const activationCode = activationToken.activationCode;
        const data = { user: { name: user.name }, activationCode };
        try {
            await sendMail({
                email: user.email,
                subject: "Activate your account.",
                template: "activation-mail.ejs",
                data,
            });
            res.status(201).json({
                success: true,
                message: `Please check your email:${user.email} to activate your account `,
                activationToken: activationToken.token,
            });
        }
        catch (error) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
    catch (error) {
        return next(new ErrorHandler(error.message, 400));
    }
});
export const activateUser = CatchAsyncError(async (req, res, next) => {
    try {
        const { activation_code, activation_token } = req.body;
        if (!activation_token || !activation_code) {
            return next(new ErrorHandler("Activation token and code are required", 400));
        }
        const newUser = jwt.verify(activation_token, process.env.ACTIVATION_SECRET);
        if (newUser.activationCode !== activation_code) {
            return next(new ErrorHandler("Invalid activation code", 400));
        }
        const { name, email, password } = newUser.user;
        const existUser = await userModel.findOne({ email });
        if (existUser) {
            return next(new ErrorHandler("Email is already exist", 400));
        }
        //  create user first
        const user = await userModel.create({
            name,
            email,
            password,
        });
        let partnerId;
        try {
            //create partner in Odoo
            partnerId = await odooRequest("res.partner", "create", [
                {
                    name: user.name,
                    email: user.email,
                },
            ]);
        }
        catch (err) {
            console.error("❌ Odoo error:", err);
            // 🔥 IMPORTANT: rollback user
            await user.deleteOne();
            return next(new ErrorHandler("Failed to sync with Odoo", 500));
        }
        // save partner id
        user.odooPartnerId = Number(partnerId);
        await user.save();
        res.status(201).json({
            success: true,
            message: "User activated and synced with Odoo",
        });
    }
    catch (error) {
        console.error("Activation Error:", error);
        return next(new ErrorHandler(error.message || "Something went wrong", 400));
    }
});
export const loginUser = CatchAsyncError(async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return next(new ErrorHandler("Please enter your email and password ", 400));
        }
        const user = await userModel.findOne({ email }).select("+password");
        if (!user) {
            return next(new ErrorHandler("Invalid email or password", 400));
        }
        const isPasswordMatch = await user.comparePassword(password);
        if (!isPasswordMatch) {
            return next(new ErrorHandler("Invalid email or password", 400));
        }
        sendToken(user, 200, res);
        user.save();
    }
    catch (error) {
        return next(new ErrorHandler(error.message, 400));
    }
});
//logout user
export const logoutUser = CatchAsyncError(async (req, res, next) => {
    try {
        res.cookie("ACCESS_TOKEN_SECRET", "", { maxAge: 1 });
        res.cookie("refresh_token", "", { maxAge: 1 });
        const userId = req.user?._id || "";
        res.status(200).json({
            success: true,
            message: "Logged out is successfully",
        });
    }
    catch (error) {
        return next(new ErrorHandler(error.message, 400));
    }
});
//update access token
export const refreshTokenMiddleware = CatchAsyncError(async (req, res, next) => {
    try {
        const refresh_token = req.cookies.refresh_token;
        // ← If no refresh cookie (mobile client), just continue
        if (!refresh_token) {
            return next(); // ← was: return next(new ErrorHandler(..., 401))
        }
        const decoded = jwt.verify(refresh_token, process.env.REFRESH_TOKEN);
        const user = await userModel.findById(decoded.id);
        if (!user)
            return next(new ErrorHandler("User not found", 404));
        const accessToken = jwt.sign({ id: user._id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
        const refreshToken = jwt.sign({ id: user._id }, process.env.REFRESH_TOKEN, { expiresIn: "3d" });
        res.cookie("ACCESS_TOKEN_SECRET", accessToken, accessTokenOptions);
        res.cookie("refresh_token", refreshToken, refreshTokenOptions);
        req.user = user;
        next();
    }
    catch (error) {
        // Token invalid/expired cookie — just continue to isAuthenticated
        return next();
    }
});
// ✅ standalone route — uses middleware then sends response
export const updateAccessToken = CatchAsyncError(async (req, res, next) => {
    return res.status(200).json({
        success: true,
        accessToken: req.cookies.ACCESS_TOKEN_SECRET,
    });
});
// get user profile
export const getUserInfo = CatchAsyncError(async (req, res, next) => {
    try {
        const userId = req.user?._id;
        getUserById(userId, res);
    }
    catch (error) {
        return next(new ErrorHandler(error.message, 400));
    }
});
// update user info
export const updateUserInfo = CatchAsyncError(async (req, res, next) => {
    try {
        const { name, phone, email } = req.body;
        const userId = req.user?._id;
        const user = await userModel.findById(userId);
        if (!user) {
            return next(new ErrorHandler("User not found", 404));
        }
        if (name)
            user.name = name;
        if (phone)
            user.phone = phone;
        if (email)
            user.email = email;
        await user.save();
        res.status(200).json({
            success: true,
            user,
        });
    }
    catch (error) {
        return next(new ErrorHandler(error.message, 400));
    }
});
export const socialAuth = CatchAsyncError(async (req, res, next) => {
    try {
        const { email, name, avatar } = req.body;
        const user = await userModel.findOne({ email });
        if (!user) {
            const newUser = await userModel.create({ email, name, avatar });
            sendToken(newUser, 200, res);
        }
        else {
            sendToken(user, 200, res);
        }
    }
    catch (error) {
        return next(new ErrorHandler(error.message, 400));
    }
});
export const updatePassword = CatchAsyncError(async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return next(new ErrorHandler("Please inter your old and new password", 400));
        }
        const user = await userModel.findById(req.user?._id).select("password");
        if (user?.password === undefined) {
            return next(new ErrorHandler("Invalid user", 400));
        }
        if (!user) {
            return next(new ErrorHandler("User not found", 404));
        }
        const isPasswordMatch = await user?.comparePassword(oldPassword);
        if (!isPasswordMatch) {
            return next(new ErrorHandler("Invalid old password", 400));
        }
        user.password = newPassword;
        await user?.save();
        await userModel.findByIdAndUpdate(req.user?._id, user);
        res.status(201).json({
            success: true,
            user,
        });
    }
    catch (error) {
        return next(new ErrorHandler(error.message, 400));
    }
});
// update user profile picture
export const updateProfilePicture = CatchAsyncError(async (req, res, next) => {
    try {
        const { avatar } = req.body;
        const userId = req?.user?._id;
        const user = await userModel.findById(userId);
        if (avatar && user) {
            // Delete old avatar if exists
            if (user?.avatar?.public_id) {
                await cloudinary.v2.uploader.destroy(user.avatar.public_id);
            }
            // Upload new avatar
            const myCloud = await cloudinary.v2.uploader.upload(avatar, {
                folder: "avatars",
                width: 150,
            });
            user.avatar = {
                public_id: myCloud.public_id,
                url: myCloud.secure_url,
            };
        }
        await user?.save();
        res.status(201).json({
            success: true,
            user,
        });
    }
    catch (error) {
        return next(new ErrorHandler(error.message, 400));
    }
});
//get all users === only for manager
export const getAllUsers = CatchAsyncError(async (req, res, next) => {
    try {
        const userRole = req.user?.role;
        if (userRole !== "manager") {
            return next(new ErrorHandler("You are not authorized to view all users", 403));
        }
        getAllUsersService(res);
    }
    catch (error) {
        return next(new ErrorHandler(error.message, 400));
    }
});
// update user role === only for manager
export const updateUserRole = CatchAsyncError(async (req, res, next) => {
    try {
        const userRole = req.user?.role;
        if (userRole !== "manager") {
            return next(new ErrorHandler("You are not authorized to update user roles", 403));
        }
        const { id, role } = req.body;
        const isUserExist = await userModel.findById(id);
        if (!isUserExist) {
            return res.status(400).json({
                success: false,
                message: "User Not Found",
            });
        }
        await updateUserRoleService(res, id.toString(), role);
    }
    catch (error) {
        return next(new ErrorHandler(error.message, 400));
    }
});
//Delete user === only admin
export const deleteUser = CatchAsyncError(async (req, res, next) => {
    try {
        const userRole = req.user?.role;
        if (userRole !== "admin") {
            return next(new ErrorHandler("You are not authorized to delete users", 403));
        }
        const { id } = req.params;
        const user = await userModel.findById(id);
        if (!user) {
            return next(new ErrorHandler("User not founf", 404));
        }
        await user.deleteOne({ id });
        res.status(201).json({
            success: true,
            message: "User deleted successfully",
        });
    }
    catch (error) {
        return next(new ErrorHandler(error.message, 400));
    }
});
