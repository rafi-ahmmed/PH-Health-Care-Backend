import config from "../config";
import { redisClient } from "./redis";

export const bkashIdToken = async () => {
	try {
		const idTokenKey = "bkash:IdToken";
		const refreshTokenKey = "bkash:refreshToken";

		let bkashIdToken = await redisClient.get(idTokenKey);
		const bkashRefreshToken = await redisClient.get(refreshTokenKey);
		const idTokenTTL = await redisClient.ttl(idTokenKey);
		const refreshTokenTTL = await redisClient.ttl(refreshTokenKey);

		console.log(idTokenTTL / 1000);

		// Check if the id token is about to expire or doesn't exist, and if the refresh token exists and is not about to expire
		if (
			(idTokenTTL <= 600 || !bkashIdToken) &&
			bkashRefreshToken &&
			refreshTokenTTL > 600
		) {
			const refreshTokenResponse = await fetch(
				`${config.bkash_sandbox_url}/tokenized/checkout/token/refresh`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						username: config.bkash_sandbox_username,
						password: config.bkash_sandbox_password,
					},
					body: JSON.stringify({
						app_key: config.bkash_sandbox_app_key,
						app_secret: config.bkash_sandbox_app_secret,
						refresh_token: bkashRefreshToken,
					}),
				},
			);

			if (!refreshTokenResponse.ok) {
				throw new Error("Bkash access token run failed");
			}

			const result = await refreshTokenResponse.json();
			bkashIdToken = result.id_token as string;

			console.log("new access and refresh", result);

			await redisClient.set(idTokenKey, bkashIdToken, {
				expiration: {
					type: "EX",
					value: 60 * 60,
				},
			});
		}

		if (idTokenTTL < 600) {
			return bkashIdToken;
		}

		const response = await fetch(
			`${config.bkash_sandbox_url}/tokenized/checkout/token/grant`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					username: config.bkash_sandbox_username,
					password: config.bkash_sandbox_password,
				},
				body: JSON.stringify({
					app_key: config.bkash_sandbox_app_key,
					app_secret: config.bkash_sandbox_app_secret,
				}),
			},
		);

		if (!response.ok) {
			throw new Error("Bkash access token run failed");
		}
		const result = await response.json();

		// set id token in redis
		redisClient.set(idTokenKey, result.id_token, {
			expiration: {
				type: "EX",
				value: 60 * 60,
			},
		});

		// set id refreshToken in redis
		redisClient.set(refreshTokenKey, result.refresh_token, {
			expiration: {
				type: "EX",
				value: 60 * 60 * 24 * 28,
			},
		});

		bkashIdToken = result.id_token;

		return bkashIdToken;
	} catch (error: any) {
		console.log(error);
		throw new Error(error.message);
	}
};
