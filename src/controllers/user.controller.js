import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "something went wrong while creating access and refresh token",
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, username, email, password } = req.body;

  if (
    [fullName, username, email, password].some((field) => field?.trim === "")
  ) {
    throw new ApiError(400, "All fields are required");
    return;
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with username or email is already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;
  const coverImageLocalPath = req.files?.coverImage[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar is required");
  }

  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken",
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registring the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User reigistered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;

  if (!email || !username) {
    throw new ApiError(400, "username or email is required");
  }

  const user = User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(400, "user not found");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(400, "invalid password");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id,
  );

  const loggedInUser = User.findById(user._id).select(
    "-password -refreshToken",
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "user loggedin successfully",
      ),
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    },
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie(accessToken, options)
    .clearCookie(refreshToken, options)
    .json(new ApiResponse(200, "User logged out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incommingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;
  if (!incommingRefreshToken) {
    throw new ApiError(401, "unauthorize request");
  }

  try {
    const decodedToken = jwt.verify(
      incommingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET,
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incommingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Invalid or expired refresh token");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens();

    return res
      .status(200)
      .cookie("accessToken", accessToken)
      .cookie("refreshToken", newRefreshToken)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken: newRefreshToken,
          },
          "access token refreshed",
        ),
      );
  } catch (error) {
    throw new ApiError(401, error?.message | "invalid refresh token");
  }
});

const chenageCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = User.findById(req.user._id);

  const isPasswordCorrect = user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "invaild old password");
  }

  user.password = newPassword;

  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password Changed Successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(200, req.user, "Current User Fetched Successfully");
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, "at least one field required to update ");
  }

  const user = User.findOneAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    { new: true },
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "No file avatar uploaded");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    {
      new: true,
    },
  ).select("-password");

  return res
  .status(200)
  .json(200,user,"Avatar image updated successfully")
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "No file cover image uploaded");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    {
      new: true,
    },
  ).select("-password");
  
  return res
  .status(200)
  .json(200,user,"cover image updated successfully")
});

const getUserChannelProfile = asyncHandler(async(req,res)=>{
    const username = req.params

    if(!username?.trim()){
        throw new ApiError(400,"username is missing")
    }

    const channel = await User.aggregate([
        {
            $match:{
                username:username?.toLowerCase()
            }
        },{
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
            }
        }
        ,{
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        },{
            $addFields:{
                subscribersCount:{
                    $size:"$subscribers"
                },
                channelsSubscribedToCount:{
                    $size:"$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if:{$in:[req.user?._id,"$subscribers.subscribers"]},
                        then:true,
                        else:false
                    }
                }
            }
        },
        {
            $project:{
                fullName:1,
                username:1,
                email:1,
                avatar:1,
                coverImage:1,
                subscribersCount:1,
                channelsSubscribedToCount:1,
                isSubscribed:1
            }
        }
    ])

    if(!channel?.length){
        throw new ApiError(404,"Channel not found")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(200,channel[0],"User channel fetched successfully")
    )
})

const getWatchHistory = asyncHandler(async(req,res)=>{
    const user = User.aggregate([
        {
            $match:{
                _id:new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
          $lookup:{
            from:"videos",
            localField:"watchHistory",
            foreignField:"_id",
            as:"watchHistory",
            pipeline:[
              {
                $lookup:{
                  from:"users",
                  localField:"owner",
                  foreignField:"_id",
                  as:"owner",
                  pipeline:[
                    {
                      $project:{
                        fullName:1,
                        username:1,
                        avatar:1
                      }
                    }
                  ]
                }
              },
              {
                $addFields:{
                  $owner:{
                    $first:"$owner"
                  }
                }
              }
            ]
          }
        }
    ])

    return res
    .status(200)
    .json(
      new ApiResponse(200,user[0].watchHistory,"Watch history fetched successfully")
    )
})

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  chenageCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory
};
