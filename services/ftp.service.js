import ftp from "basic-ftp";
import logger from "../utilities/logger.js";

export async function getFilenames(year) {
  const client = new ftp.Client();

  try {
    await client.access({
      host: process.env.BUNNY_HOST,
      user: process.env.BUNNY_USER,
      password: process.env.BUNNY_PASS,
      secure: false,
    });

    const list = await client.list(`${year}/`);

    return list.map((item) => item.name);
  } catch (err) {
    logger.error(err);
    if (err.port == "21") {
      logger.info("FTP Connect Error");
    }
    return [];
  } finally {
    client.close();
  }
}
