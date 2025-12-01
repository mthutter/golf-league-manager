import { Client } from "basic-ftp";

//const { Client } = require("basic-ftp"); 

example()

async function example() {
    const client = new Client()
    client.ftp.verbose = true
    try {
        await client.access({
            host: "la.storage.bunnycdn.com",
            user: "bottoms-up",
            password: "ac5c1048-f353-4655-8dbe4c573ee9-85ec-4a40",
            secure: false
        });
        console.log("Connected!");
        
        const fileList = await client.list("2024/");

        console.log("FILES:");
        for (const item of fileList) {
            console.log(`${item.name} - ${item.type === 0 ? "DIR" : "FILE"}`);
        }
        //await client.uploadFrom("README.md", "README_FTP.md")
        //await client.downloadTo("README_COPY.md", "README_FTP.md")
    }
    catch(err) {
        console.error("FTP Error:", err);
    }
    client.close();
}