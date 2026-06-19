import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
const emailRegexPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ROLES = {
    USER: "user",
    MANAGER: "manager",
    TECHNICIAN: "technician",
};
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Please enter your name"],
    },
    email: {
        type: String,
        required: [true, "Please enter your email"],
        validate: {
            validator: function (value) {
                return emailRegexPattern.test(value);
            },
            message: "Please enter valid email",
        },
        unique: true,
    },
    password: {
        type: String,
        minlength: [6, "Password must be at least 6 character"],
        select: false,
    },
    avatar: {
        public_id: String,
        url: String,
    },
    role: {
        type: String,
        enum: Object.values(ROLES),
        default: "user",
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    phone: {
        type: String,
    },
    address: {
        street: String,
        city: String,
        country: String,
        zip: String,
    },
    orders: [{ orderId: String }],
    odooPartnerId: {
        type: Number,
    },
}, { timestamps: true });
//Mash Password before saving
userSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return;
    }
    this.password = await bcrypt.hash(this.password, 10);
});
//sign access token
userSchema.methods.SignAccessToken = function () {
    const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
    if (!accessTokenSecret) {
        throw new Error("ACCESS_TOKEN_SECRET is not defined");
    }
    return jwt.sign({ id: this._id }, accessTokenSecret, { expiresIn: "1h" });
};
//signrefresh token
userSchema.methods.SignRefreshToken = function () {
    const refreshTokenSecret = process.env.REFRESH_TOKEN;
    if (!refreshTokenSecret) {
        throw new Error("REFRESH_TOKEN is not defined");
    }
    return jwt.sign({ id: this._id }, refreshTokenSecret, { expiresIn: "3d" });
};
//compare password
userSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};
userSchema.methods.hasRole = function (roles) {
    return roles.includes(this.role);
};
const userModel = mongoose.model("User", userSchema);
export default userModel;
