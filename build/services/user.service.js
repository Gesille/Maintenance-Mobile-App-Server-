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
