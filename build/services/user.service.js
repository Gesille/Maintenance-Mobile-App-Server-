import userModel from "../models/user.model.js";
//get user by id
export const getUserById = async (id, res) => {
    const user = await userModel.findById(id);
    res.status(200).json({
        success: true,
        user,
    });
};
//Get All Users
export const getAllUsersService = async (res) => {
    const users = await userModel.find().sort({ createdAt: -1 });
    res.status(201).json({
        success: true,
        users,
    });
};
//update user role
export const updateUserRoleService = async (res, id, role) => {
    const user = await userModel.findByIdAndUpdate(id, { role }, { new: true });
    res.status(201).json({
        success: true,
        user,
    });
};
export const getTechniciansService = async () => {
    return userModel
        .find({ role: "technician" })
        .select("name email")
        .sort({ name: 1 })
        .lean();
};
// ─── Manager creates a user directly (no activation-email flow) ─────────────
export const createUserService = async (data) => {
    const user = await userModel.create({
        name: data.name,
        email: data.email,
        password: data.password,
        role: data.role,
        phone: data.phone,
        isVerified: true, // manager-created accounts don't need email verification
    });
    // strip password before returning
    const safeUser = user.toObject();
    delete safeUser.password;
    return safeUser;
};
