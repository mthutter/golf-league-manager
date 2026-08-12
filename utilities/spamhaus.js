import dns from "node:dns/promises";

// Helper to reverse IP for DNSBL (e.g., 1.2.3.4 -> 4.3.2.1)
function reverseIp(ip) {
    if (!ip.includes(".")) return null; // Basic IPv4 check
    return ip.split(".").reverse().join(".");
}

export async function spamhausCheck(req, res, next) {
    // Express now safely populates req.ip thanks to app.set('trust proxy', 1)
    const clientIp = req.ip;
    const cleanIp = clientIp.replace(/^::ffff:/, "");

    const reversed = reverseIp(cleanIp);
    if (!reversed) return next();

    const queryDomain = `${reversed}.zen.spamhaus.org`;

    try {
        // Perform DNS lookup
        await dns.resolve4(queryDomain);
        // If it resolves, the IP is on the blocklist
        return res.status(403).json({
            error: "Access denied: IP flagged by security blocklist."
        });
    } catch (err) {
        // NXDOMAIN means the IP is NOT listed (clean)
        if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
            return next();
        }
        // Log unexpected DNS errors and allow request through safely
        console.error("Spamhaus check error:", err);
        return next();
    }
}