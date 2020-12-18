const core   = require("@actions/core");
const githubAction = require("@actions/github");

const protected_defaults = [
    ".github/",
    "tests/",
    "test/",
    ".gitignore"
];

async function action() {
    const token = core.getInput("github-token", {required: true});

    const github = new githubAction.getOctokit(token);

    const changeLog = await github.request(githubAction.context.payload.repository.compare_url, {
        base: githubAction.context.payload.before,
        head: githubAction.context.payload.after
    });

    const files = changeLog.data.files.map(file => file.filename);

    const protected_extra = core.getInput("protected-paths", {required: false});

    const protected_paths = protected_defaults.concat(protected_extra || []);

    // check normal protected files
    const hold_protected = files
        .map((file) => protected_paths
            .map((path) => file.startsWith(path))
            .reduce((v, c) => v || c, false))
        .reduce((v, c) => v && c, true);

    core.info(`protected directories? ${ hold_protected }`);

    // check if package files changed
    const hold_package = files
        .map((file) => file === "package.json" ||
                      file === "package-lock.json")
        .reduce((v, c) => v || c, false);

    let isdevChange = 0;

    let isotherChange = 0;

    if (hold_package) {
        core.info("check for changed development dependencies");
        const pInfo = changeLog.data.files
            .filter((file) => file.filename === "package.json");

        const pFile = await github.request(pInfo[0].raw_url);
        const devDeps = Object.keys(JSON.parse(pFile.data).devDependencies);

        const changes = pInfo[0].patch
            .split("\n")
            .filter((change) => change.match(/^[+-]\s*/))
            .map((change) => change.replace(/^[+-]\s*"([^"]+).*$/, "$1"))
            .filter((change) => change && change.length);

        isdevChange = changes
            .filter((change) => devDeps.includes(change))
            .length;

        isotherChange = changes.length - isdevChange;

        core.info(`changed devDependencies ${ isdevChange }`);
        core.info(`changed other dependencies ${ isotherChange }`);
    }

    core.info(`hold protected: ${ hold_protected && isotherChange === 0 }`);
    core.info(`hold development: ${ isdevChange > 0 && isotherChange === 0 }`);

    core.setOutput("hold_protected", hold_protected && isotherChange === 0);

    const hold_development = isdevChange > 0 && isotherChange === 0;

    if (hold_development) {
        core.info("is dev only change. HOLD!");
    }

    core.setOutput("hold_development", hold_development);
    core.setOutput("proceed", !(hold_protected || hold_development));
}

action()
    .then(() => core.info("success"))
    .catch(error => core.setFailed(error.message));
