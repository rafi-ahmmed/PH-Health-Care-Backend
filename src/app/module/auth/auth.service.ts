import bcrypt from "bcryptjs";
import crypto from "crypto";
import ejs from "ejs";
import type { TokenPayload } from "google-auth-library";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import path from "path";
import {
	AuthProvider,
	Role,
	UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { googleClient } from "../../lib/googleAuth";
import { transporter } from "../../lib/modemailer";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import { jwtUtils } from "../../utils/jwt";
import type {
	IForgetPasswordPayload,
	IGoogleLoginPayload,
	ILoginUserPayload,
	IRegisterPatientPayload,
	IRequestUser,
	IResetPasswordPayload,
	IVerifyEmailPayload,
} from "./auth.interface";

const registerPatient = async (payload: IRegisterPatientPayload) => {
	const { name, password, patient: patientData } = payload;
	const email = payload.email.trim().toLowerCase();

	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists) {
		throw new Error("User with this email already exists");
	}

	const hashedPassword = await bcrypt.hash(
		password,
		Number(config.bcrypt_salt_rounds),
	);

	const otpValue = crypto.randomInt(100000, 1000000).toString();
	const redisUserDataPayload = {
		name,
		email,
		password: hashedPassword,
		patient: patientData,
	};

	const otpKey = `user-registration-otp:${email}`;
	const patientRegistrationKey = `patient-registration-data:${email}`;

	await redisClient.set(otpKey, otpValue, {
		expiration: {
			type: "EX",
			value: 5 * 60,
		},
	});

	await redisClient.set(
		patientRegistrationKey,
		JSON.stringify(redisUserDataPayload),
		{
			expiration: {
				type: "EX",
				value: 5 * 60,
			},
		},
	);

	const template_path = path.join(
		process.cwd(),
		"src/app/templates/verify-email.ejs",
	);

	const html = await ejs.renderFile(template_path, {
		otp: otpValue,
	});

	await transporter.sendMail({
		from: config.email_sender,
		to: email,
		subject: "Email verification",
		// html: `<h1>Your OTP: ${otp}</h1>`,
		html,
	});
};

const verifyPatientEmail = async (payload: IVerifyEmailPayload) => {
	const email = payload.email.trim().toLowerCase();
	const otp = payload.otp;

	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists?.status === UserStatus.BLOCKED) {
		throw new Error("User is blocked");
	}

	if (isUserExists?.emailVerified) {
		throw new Error("Email already Verified");
	}

	if (isUserExists?.isDeleted || isUserExists?.status === UserStatus.DELETED) {
		throw new Error("User is Deleted");
	}

	const otpKey = `user-registration-otp:${email}`;
	const redisOtp = await redisClient.get(otpKey);
	const patientRegistrationKey = `patient-registration-data:${email}`;

	console.log("otp", otp);
	console.log("redis otp", redisOtp);

	if (!redisOtp) {
		throw new Error("Invalid OTP!");
	}
	if (redisOtp !== otp) {
		throw new Error("Otp doesn`t match!");
	}

	const redisUserData = await redisClient.get(patientRegistrationKey);

	if (!redisUserData) {
		throw new Error("User doesn't exiest");
	}

	await redisClient.del(otpKey);

	const patientPayload: IRegisterPatientPayload = JSON.parse(redisUserData);

	const {
		name,
		email: userEmail,
		password,
		patient: patientData,
	} = patientPayload;

	const createdUser = await prisma.user.create({
		data: {
			name,
			email: userEmail,
			password,
			role: Role.PATIENT,
			status: UserStatus.ACTIVE,
			emailVerified: true,
			patient: {
				create: {
					name,
					email,
					contactNumber: patientData?.contactNumber || "",
				},
			},
		},
		omit: { password: true },
		include: { patient: true },
	});

	await redisClient.del(patientRegistrationKey);

	const { patient, ...user } = createdUser;
	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions["expiresIn"],
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions["expiresIn"],
	);

	// Send welcome email to the user
	const template_path = path.join(
		process.cwd(),
		"src/app/templates/welcome-email.ejs",
	);

	const html = await ejs.renderFile(template_path, {
		name: user.name,
		email: user.email,
	});

	await transporter.sendMail({
		from: config.email_sender,
		to: email,
		subject: "Welcome to PH Healthcare",

		html,
	});

	return {
		user,
		patient,
		accessToken,
		refreshToken,
	};
};

const loginUser = async (payload: ILoginUserPayload) => {
	const { password } = payload;
	const email = payload.email.trim().toLowerCase();

	const user = await prisma.user.findUnique({
		where: { email },
	});

	if (!user) {
		throw new Error("User not found");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new Error("User is blocked");
	}

	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new Error("User is deleted");
	}

	if (user.password === null && user.googleId !== null) {
		throw new Error(
			"User already registered with google.. Please! signin with google",
		);
	}

	const isPasswordMatched = await bcrypt.compare(
		password,
		user.password as string,
	);

	if (!isPasswordMatched) {
		throw new Error("Invalid credentials");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions["expiresIn"],
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions["expiresIn"],
	);

	return {
		accessToken,
		refreshToken,
	};
};

const getMe = async (user: IRequestUser) => {
	const isUserExists = await prisma.user.findUnique({
		where: {
			id: user.userId,
		},
		include: {
			patient: true,
		},
		omit: {
			password: true,
		},
	});

	if (!isUserExists) {
		throw new Error("User not found");
	}

	return isUserExists;
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
		throw new Error(
			config.node_env === "development"
				? verifiedRefreshToken.error
				: "Invalid refresh token",
		);
	}

	const data = verifiedRefreshToken.data as JwtPayload;

	const user = await prisma.user.findUnique({
		where: { id: data.userId },
	});

	if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
		throw new Error("User is inactive or not found");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions["expiresIn"],
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions["expiresIn"],
	);

	return {
		accessToken,
		refreshToken,
	};
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
	let googleTokenPayload: TokenPayload | null | undefined = null;
	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.google_client_id,
		});

		googleTokenPayload = ticket.getPayload();
	} catch (error) {
		console.log("Google", error);
		throw new Error("Invalid or Expire google Id Token");
	}

	if (!googleTokenPayload) {
		throw new Error("Invalid or Expire google Id Token");
	}
	if (!googleTokenPayload.email) {
		throw new Error("Google user Email not found");
	}
	if (!googleTokenPayload.name) {
		throw new Error("Google user Name not found");
	}

	const ifPatientExistWithGoogleAuth = await prisma.user.findUnique({
		where: {
			email: googleTokenPayload.email,
			role: Role.PATIENT,
			googleId: googleTokenPayload.sub,
		},
	});

	let user = ifPatientExistWithGoogleAuth;

	// * If user not exist with google auth but exist with credentials
	if (!ifPatientExistWithGoogleAuth) {
		// * Check is user exist with credentials
		const ifPatientExistWithCredentials = await prisma.user.findUnique({
			where: {
				email: googleTokenPayload.email,
				role: Role.PATIENT,
				authProvider: AuthProvider.CREDENTIAL,
			},
		});

		if (ifPatientExistWithCredentials) {
			if (ifPatientExistWithCredentials.status === UserStatus.BLOCKED) {
				throw new Error("User is Blocked");
			}
			if (
				ifPatientExistWithCredentials.isDeleted ||
				ifPatientExistWithCredentials.status === UserStatus.DELETED
			) {
				throw new Error("User is Deleted");
			}

			user = await prisma.user.update({
				where: {
					id: ifPatientExistWithCredentials.id,
				},
				data: {
					googleId: googleTokenPayload.sub,
				},
			});
		} else {
			//* if not exists with credentials so create user with  Google
			user = await prisma.user.create({
				data: {
					name: googleTokenPayload.name,
					email: googleTokenPayload.email,
					role: Role.PATIENT,
					emailVerified: true,
					googleId: googleTokenPayload.sub,
					authProvider: AuthProvider.GOOGLE,
					patient: {
						create: {
							name: googleTokenPayload.name,
							email: googleTokenPayload.email,
						},
					},
				},
				include: {
					patient: true,
				},
			});

			// * send welcome email to user
			const template_path = path.join(
				process.cwd(),
				"src/app/templates/welcome-email.ejs",
			);

			const html = await ejs.renderFile(template_path, {
				name: user.name,
				email: user.email,
			});

			await transporter.sendMail({
				from: config.email_sender,
				to: user.email,
				subject: "Welcome to PH Healthcare",
				// html: `<h1>Your OTP: ${otp}</h1>`,
				html,
			});
		}
	}

	if (!user) {
		throw new Error("User not Found");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new Error("User is Blocked");
	}
	if (user.isDeleted || user?.status === UserStatus.DELETED) {
		throw new Error("User is Deleted");
	}

	const jwtPayload = {
		userId: user?.id,
		name: user?.name,
		email: user?.email,
		role: user?.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions["expiresIn"],
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions["expiresIn"],
	);

	return {
		accessToken,
		refreshToken,
	};
};

const forgetPassword = async (payload: IForgetPasswordPayload) => {
	const { email } = payload;

	const isUserExist = await prisma.user.findUnique({
		where: {
			email,
		},
	});

	if (!isUserExist) {
		throw new Error("User not Found");
	}

	if (isUserExist.status === UserStatus.BLOCKED) {
		throw new Error("User is blocked");
	}

	if (!isUserExist.emailVerified) {
		throw new Error("User email is not verified");
	}

	if (isUserExist.isDeleted || isUserExist.status === UserStatus.DELETED) {
		throw new Error("User is Deleted");
	}

	if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
		throw new Error("User has an account with google");
	}

	const otp = crypto.randomInt(100000, 1000000).toString();

	const key = `forget-password-otp:${isUserExist.email}`;

	await redisClient.set(key, otp, {
		expiration: {
			type: "EX",
			value: 5 * 60,
		},
	});

	const template_path = path.join(
		process.cwd(),
		"src/app/templates/forget-password.ejs",
	);

	const html = await ejs.renderFile(template_path, {
		otp,
	});

	await transporter.sendMail({
		from: config.email_sender,
		to: isUserExist.email,
		subject: "Forgot password",
		// html: `<h1>Your OTP: ${otp}</h1>`,
		html,
	});
};

const resetPassword = async (payload: IResetPasswordPayload) => {
	const { email, otp, newPassword } = payload;

	const isUserExist = await prisma.user.findUnique({
		where: {
			email,
		},
	});

	if (!isUserExist) {
		throw new Error("User not Found");
	}

	if (isUserExist.status === UserStatus.BLOCKED) {
		throw new Error("User is blocked");
	}

	if (!isUserExist.emailVerified) {
		throw new Error("User email is not verified");
	}

	if (isUserExist.isDeleted || isUserExist.status === UserStatus.DELETED) {
		throw new Error("User is Deleted");
	}

	if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
		throw new Error("User has an account with google");
	}

	const key = `forget-password-otp:${isUserExist.email}`;
	const redisOtp = await redisClient.get(key);

	if (!redisOtp) {
		throw new Error("Invalid OTP!");
	}
	if (redisOtp !== otp) {
		throw new Error("ORP doesn`t match!");
	}

	const hashedPassword = await bcrypt.hash(
		newPassword,
		Number(config.bcrypt_salt_rounds),
	);

	await prisma.user.update({
		where: {
			email: isUserExist.email,
		},
		data: {
			password: hashedPassword,
		},
	});

	await redisClient.del([key]);

	const template_path = path.join(
		process.cwd(),
		"src/app/templates/reset-password-success.ejs",
	);

	const html = await ejs.renderFile(template_path);

	await transporter.sendMail({
		from: config.email_sender,
		to: isUserExist.email,
		subject: "Forgot password",
		// html: `<h1>Your OTP: ${otp}</h1>`,
		html,
	});

	await transporter.sendMail({
		from: config.email_sender,
		to: isUserExist.email,
		subject: "Password Changed",
		html,
	});
};

export const AuthService = {
	registerPatient,
	verifyPatientEmail,
	loginUser,
	getMe,
	refreshToken,
	googleLogin,
	forgetPassword,
	resetPassword,
};
