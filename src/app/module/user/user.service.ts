import type { UploadApiResponse } from "cloudinary";
import cloudinary from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

const uploadProfileImage = async (buffer: Buffer, userId: string) => {
	const currentUser = await prisma.user.findUnique({
		where: {
			id: userId,
		},
		select: {
			image: true,
			imagePublicId: true,
		},
	});

	const cloudenaryResult = await new Promise<UploadApiResponse>(
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
				.end(buffer);
		},
	);

	const updatedUser = await prisma.user.update({
		where: {
			id: userId,
		},
		data: {
			image: cloudenaryResult?.secure_url,
			imagePublicId: cloudenaryResult.public_id,
		},
		omit: {
			password: true,
		},
	});

	if (currentUser?.imagePublicId && currentUser?.image) {
		await cloudinary.uploader.destroy(currentUser.imagePublicId);
	}
	return updatedUser;
};

export const UserService = {
	uploadProfileImage,
};
