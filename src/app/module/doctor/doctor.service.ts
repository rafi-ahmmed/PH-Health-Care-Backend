import bcrypt from "bcryptjs";
import type { UploadApiResponse } from "cloudinary";
import crypto from "crypto";
import ejs from "ejs";
import path from "path";
import {
	DoctorVerificationStatus,
	Role,
} from "../../../generated/prisma/enums";
import config from "../../config";
import cloudinary from "../../lib/cloudinary";
import { transporter } from "../../lib/modemailer";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import type { RequestUser } from "../../middleware/checkAuth";
import type { IVerifyEmailPayload } from "../auth/auth.interface";
import type { IApplyForDoctor, IApproveDoctor } from "./doctor.interface";

const applyForDoctor = async (
	resume: any,
	additionalFiles: any[],
	payload: IApplyForDoctor,
) => {
	console.log(resume);
	console.log(additionalFiles);
	console.log(payload);

	const isDoctorExists = await prisma.doctor.findUnique({
		where: {
			email: payload.user.email,
		},
	});

	if (isDoctorExists) {
		throw new Error("Doctor already exists for this user.");
	}

	const hasPassPassword = await bcrypt.hash(payload.user.password, 10);

	const resumeResult = await new Promise<UploadApiResponse>(
		(resolve, reject) => {
			cloudinary.uploader
				.upload_stream({ resource_type: "auto" }, async (error, result) => {
					if (error) {
						console.log(error);
						return reject(error);
					}

					if (!result) {
						return reject(new Error("No result return from cloudinary"));
					}

					resolve(result);
				})
				.end(resume.buffer);
		},
	);

	const additionalFilesResults = await Promise.all(
		additionalFiles.map(
			(file) =>
				new Promise<UploadApiResponse>((resolve, reject) => {
					cloudinary.uploader
						.upload_stream({ resource_type: "auto" }, async (error, result) => {
							if (error) {
								console.log(error);
								return reject(error);
							}

							if (!result) {
								return reject(new Error("No result return from cloudinary"));
							}

							resolve(result);
						})
						.end(file.buffer);
				}),
		),
	);

	// * Create doctor application in the database

	const doctorApplication = await prisma.user.create({
		data: {
			name: payload.user.name,
			email: payload.user.email,
			password: hasPassPassword,
			role: Role.DOCTOR,
			needPasswordChange: true,
			doctor: {
				create: {
					name: payload.user.name,
					email: payload.user.email,
					resumeUrl: resumeResult.secure_url,
					resumePublicId: resumeResult.public_id,
					additionalFiles: additionalFilesResults.map((file) => ({
						fileUrl: file.secure_url,
						publicId: file.public_id,
					})),
					experienceYears: payload.doctor.experienceYears,
					qualifications: payload.doctor.qualifications,
					licenseNumber: payload.doctor.licenseNumber,
					specialization: payload.doctor.specialization,
					consultationFee: payload.doctor.consultationFee,
					contactNumber: payload.doctor.contactNumber,
					address: payload.doctor.address,
				},
			},
		},
		include: {
			doctor: true,
		},
	});

	// * send otp in email for verification

	const otp = crypto.randomInt(100000, 1000000).toString();
	const expirationSeconds = 60 * 60;

	const key = `doctor-application-otp:${payload.user.email}`;

	await redisClient.set(key, otp, {
		expiration: {
			type: "EX",
			value: expirationSeconds,
		},
	});

	const template_path = path.join(
		process.cwd(),
		"src/app/templates/verify-email.ejs",
	);

	const html = await ejs.renderFile(template_path, {
		otp,
	});

	await transporter.sendMail({
		from: config.email_sender,
		to: payload.user.email,
		subject: "Forgot password",
		html,
	});

	return doctorApplication;
};

const verifyDoctorEmail = async (payload: IVerifyEmailPayload) => {
	const otp = payload.otp;
	const email = payload.email.trim().toLowerCase();

	const existingUser = await prisma.user.findUnique({
		where: { email, role: Role.DOCTOR },
	});

	if (!existingUser) {
		throw new Error("Doctor Application Not Found. Please Apply Again.");
	}
	if (existingUser.emailVerified) {
		throw new Error("Email Already Verified");
	}

	const otpKey = `doctor-application-otp:${payload.email}`;

	const redisOtp = await redisClient.get(otpKey);

	if (!redisOtp) {
		throw new Error(
			"OTP Expired. Your Application Window Has Closed, Please Apply Again.",
		);
	}

	if (redisOtp !== otp) {
		throw new Error("Your OTP does not match.");
	}

	await redisClient.del(otpKey);

	const verifiedUser = await prisma.user.update({
		where: { id: existingUser.id },
		data: { emailVerified: true },
		omit: { password: true },
		include: { doctor: true },
	});

	return verifiedUser;
};

const approveDoctor = async (
	payload: IApproveDoctor,
	reviewer: RequestUser,
) => {
	const { doctorId, verificationStatus, rejectionReason } = payload;

	const isDoctorExists = await prisma.doctor.findUnique({
		where: {
			id: doctorId,
		},
		include: {
			user: true,
		},
	});

	if (!isDoctorExists) {
		throw new Error("Doctor not found.");
	}

	if (isDoctorExists.isDeleted) {
		throw new Error("Doctor is deleted.");
	}

	if (isDoctorExists.user.emailVerified === false) {
		throw new Error("Doctor email is not verified.");
	}

	if (isDoctorExists.verificationStatus !== DoctorVerificationStatus.PENDING) {
		throw new Error(
			`Doctor is already ${isDoctorExists.verificationStatus.toLowerCase()}.`,
		);
	}

	const updatedDoctor = await prisma.doctor.update({
		where: {
			id: doctorId,
		},
		data: {
			verificationStatus,
			rejectionReason:
				verificationStatus === DoctorVerificationStatus.REJECTED
					? rejectionReason
					: null,
			reviewedBy: reviewer.userId,
			reviewedAt: new Date(),
		},
	});

	const isApproved = verificationStatus === DoctorVerificationStatus.APPROVED;

	const template_path = path.join(
		process.cwd(),
		`${isApproved ? "src/app/templates/doctor-application-approve.ejs" : "src/app/templates/doctor-application-rejected.ejs"} `,
	);

	const templateData = isApproved
		? { name: isDoctorExists.name }
		: { name: isDoctorExists.name, rejectionReason };

	const html = await ejs.renderFile(template_path, {
		templateData,
	});

	await transporter.sendMail({
		from: config.email_sender,
		to: updatedDoctor.email,
		subject: `Your Doctor Application has been ${isApproved ? "Approved" : "Rejected"}`,
		html,
	});

	return updatedDoctor;
};

const getAllDoctors = async () => {
	
};
// const verifyDoctorEmail = async (payload: any) => {};

export const doctorServices = {
	applyForDoctor,
	verifyDoctorEmail,
	approveDoctor,
	getAllDoctors,
};

// Resume Result: {
//   asset_id: 'aa7bc4fd2d410e46d17befe3b56138eb',
//   public_id: 'kc63c8pkbthcsdk8jfoh',
//   version: 1789932275,
//   version_id: '9f9b158d6309deb8d746fc44d06adb33',
//   signature: '7a1b4788ddd05a699e220f96ef1337b81ce571fb',
//   width: 595,
//   height: 841,
//   format: 'pdf',
//   resource_type: 'image',
//   created_at: '2026-09-20T19:24:35Z',
//   tags: [],
//   pages: 10,
//   bytes: 53837,
//   type: 'upload',
//   etag: '42bc8c67ae113d9aa23c87ec99d210e8',
//   placeholder: false,
//   url: 'http://res.cloudinary.com/dghtlkpri/image/upload/v1789932275/kc63c8pkbthcsdk8jfoh.pdf',
//   secure_url: 'https://res.cloudinary.com/dghtlkpri/image/upload/v1789932275/kc63c8pkbthcsdk8jfoh.pdf',
//   asset_folder: '',
//   display_name: 'kc63c8pkbthcsdk8jfoh',
//   original_filename: 'file',
//   api_key: '874117193169133'
// }

// Additional Files Results: [
//   {
//     asset_id: '34106f4f5e7845693e40f34c165e53bf',
//     public_id: 'v1rwtu4bbbixmrywqdsl',
//     version: 1789932277,
//     version_id: 'f89d2b71546ebe3a48c2db0bffe9f8f8',
//     signature: 'f77293a31eac4b2bdc51eeb2d304571f534d7f65',
//     width: 594,
//     height: 841,
//     format: 'pdf',
//     resource_type: 'image',
//     created_at: '2026-09-20T19:24:37Z',
//     tags: [],
//     pages: 4,
//     bytes: 229933,
//     type: 'upload',
//     etag: '7426aa14000fd37412449b073d71f460',
//     placeholder: false,
//     url: 'http://res.cloudinary.com/dghtlkpri/image/upload/v1789932277/v1rwtu4bbbixmrywqdsl.pdf',
//     secure_url: 'https://res.cloudinary.com/dghtlkpri/image/upload/v1789932277/v1rwtu4bbbixmrywqdsl.pdf',
//     asset_folder: '',
//     display_name: 'v1rwtu4bbbixmrywqdsl',
//     original_filename: 'file',
//     api_key: '874117193169133'
//   },
//   {
//     asset_id: 'f223b3016dd35e1d8ba0da0224ec255d',
//     public_id: 'mr1xmm6rykgsqa1sumok',
//     version: 1789932277,
//     version_id: 'f89d2b71546ebe3a48c2db0bffe9f8f8',
//     signature: 'f3b71a423d50f696b2b0c1ca7fb14d72cba27892',
//     width: 595,
//     height: 841,
//     format: 'pdf',
//     resource_type: 'image',
//     created_at: '2026-09-20T19:24:37Z',
//     tags: [],
//     pages: 10,
//     bytes: 53837,
//     type: 'upload',
//     etag: '42bc8c67ae113d9aa23c87ec99d210e8',
//     placeholder: false,
//     url: 'http://res.cloudinary.com/dghtlkpri/image/upload/v1789932277/mr1xmm6rykgsqa1sumok.pdf',
//     secure_url: 'https://res.cloudinary.com/dghtlkpri/image/upload/v1789932277/mr1xmm6rykgsqa1sumok.pdf',
//     asset_folder: '',
//     display_name: 'mr1xmm6rykgsqa1sumok',
//     original_filename: 'file',
//     api_key: '874117193169133'
//   }
// ]
