import { format, resolveConfig, resolveConfigFile } from "prettier";
import { ensureFilePathExists } from "../utils";

export async function lintAndFormat(args: {
  code: string;
  configPath: string;
  fakeFilePath: string;
}): Promise<string> {
  const { configPath, fakeFilePath } = args;
  let { code } = args;
  ensureFilePathExists(fakeFilePath, code);

  const configFile = await resolveConfigFile(configPath);
  if (configFile === null) {
    throw new Error("Could not resolve prettier config file");
  }
  const config = await resolveConfig(configFile);
  if (config === null) {
    throw new Error("Could not resolve prettier config");
  }

  // Prettify the code.
  code = await format(code, {
    parser: "typescript",
    ...config,
    filepath: fakeFilePath,
  });

  // // Lint the code.
  // const eslint = new ESLint({
  //     overrideConfigFile: configFile,
  //     fix: true,
  //     useEslintrc: false,
  //     reportUnusedDisableDirectives: "error",
  //     fixTypes: ["problem", "suggestion", "layout"],
  //   });
  //   const results = await eslint.lintText(code, {
  //     filePath: fakeFilePath,
  //   });

  //   console.log(results[0].messages);

  //   console.log(await ESLint.outputFixes(results));

  //   // Remove the temporary file.
  //   fs.rmSync(fakeFilePath);

  return code;
}
