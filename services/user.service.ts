import { NextFunction, Response } from "express";

import { Types } from "mongoose";
import userModel from "../models/user.model.js";

//get user by id
export const getUserById = async (id: string, res: Response) => {
  const user = await userModel.findById(id);

  res.status(200).json({
    success: true,
    user,
  });
};

//Get All Users
export const getAllUsersService = async (res: Response) => {
  const users = await userModel.find().sort({ createdAt: -1 });

  res.status(201).json({
    success: true,
    users,
  });
};

//update user role
export const updateUserRoleService = async (
  res: Response,
  id: string | Types.ObjectId,
  role: string
) => {
  const user = await userModel.findByIdAndUpdate(id, { role }, { new: true });

  res.status(201).json({
    success: true,
    user,
  });
};


