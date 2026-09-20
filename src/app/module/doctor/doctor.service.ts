import bcrypt from "bcryptjs";
import type { UploadApiResponse } from "cloudinary";
import { Role } from "../../../generated/prisma/enums";
import cloudinary from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

const applyForDoctor = async (
	resume: any,
	additionalFiles: any[],
	data: any,
) => {
	console.log(resume);
	console.log(additionalFiles);
	console.log(data);

	const isDoctorExists = await prisma.doctor.findUnique({
		where: {
			email: data.user.email,
		},
	});

	if (isDoctorExists) {
		throw new Error("Doctor already exists for this user.");
	}

	const hasPassPassword = await bcrypt.hash(data.user.password, 10);

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

	const doctorApplication = await prisma.user.create({
		data: {
			name: data.user.name,
			email: data.user.email,
			password: hasPassPassword,
			role: Role.DOCTOR,
			needPasswordChange: true,
			doctor: {
				create: {
					name: data.user.name,
					email: data.user.email,
					resumeUrl: resumeResult.secure_url,
					resumePublicId: resumeResult.public_id,
					additionalFiles: additionalFilesResults.map((file) => ({
						fileUrl: file.secure_url,
						publicId: file.public_id,
					})),
					experienceYears: data.doctor.experienceYears,
					qualifications: data.doctor.qualifications,
					licenseNumber: data.doctor.licenseNumber,
					specialization: data.doctor.specialization,
					consultationFee: data.doctor.consultationFee,
					contactNumber: data.doctor.contactNumber,
					address: data.doctor.address,
				},
			},
		},
		include: {
			doctor: true,
		},
	});

	return doctorApplication;
};

// const bookAppointmentCallback = async () => {};
export const doctorServices = {
	applyForDoctor,
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
