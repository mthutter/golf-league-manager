import ftp from "basic-ftp";

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
    console.error(err);
    if ((err.port = "21")) {
      console.log("FTP Connect Error");
    }
    return [];
  } finally {
    client.close();
  }
}
