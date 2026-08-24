import bcrypt from "bcryptjs";
import { Role } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";

export const seedSuperAdmin = async () => {
	try {
		const isSuperAdminExist = await prisma.user.findFirst({
			where: {
				role: Role.SUPER_ADMIN,
			},
		});

		if (isSuperAdminExist) {
			console.log("SuperAdmin is exist");
			return;
		}

		const name = config.super_admin_name as string;
		const email = config.super_admin_email as string;
		const password = config.super_admin_password;

		if (!name || !email || !password) {
			throw new Error("Super admin name email password is missing in env file");
		}

		const hashPassword = await bcrypt.hash(
			password as string,
			Number(config.bcrypt_salt_rounds),
		);

		const superAdmin = await prisma.user.create({
			data: {
				name,
				email,
				password: hashPassword,
				role: Role.SUPER_ADMIN,
				needPasswordChange: false,
				emailVerified: true,
			},
		});

		console.log("Super Admin Created: ", superAdmin);
	} catch (error) {
		console.log("Error seeding super admin", error);

		await prisma.user.delete({
			where: {
				email: config.super_admin_email,
			},
		});
	}
};
