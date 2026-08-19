module.exports = {
    "packagerConfig": {
        "name": "Ceremonies",
        "icon": "images/worldskills-hand",
        "appBundleId": "org.worldskills.ceremonies",
        "osxSign": {
            "identity": "Developer ID Application: WorldSkills International (7CQ5662QVR)",
            "hardenedRuntime": true,
            "gatekeeper-assess": false,
            "entitlements": "entitlements.plist",
            "entitlements-inherit": "entitlements.plist",
            "signature-flags": "library"
        },
        "osxNotarize": {
            "appleId": process.env.APPLE_ID,
            "appleIdPassword": process.env.APPLE_ID_PASSWORD,
            "teamId": process.env.APPLE_TEAM_ID,
        }
    },
    "makers": [
        {
            "name": "@electron-forge/maker-squirrel",
            "config": {}
        },
        {
            "name": "@electron-forge/maker-zip",
            "platforms": [
                "darwin"
            ]
        },
        {
            "name": "@electron-forge/maker-deb",
            "config": {}
        },
        {
            "name": "@electron-forge/maker-rpm",
            "config": {}
        }
    ],
    "publishers": [
        {
            "name": "@electron-forge/publisher-github",
            "config": {
                "repository": {
                    "owner": "worldskills",
                    "name": "worldskills-ceremonies"
                },
                "prerelease": false,
                "draft": true
            }
        }
    ]
};
