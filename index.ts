#!/usr/bin/env node

import { lightBlue } from "kolorist";
import { CodeGenerator, getCodeGenConfig } from "./src/index.js";
import { Aptos, AptosConfig, Network, AccountAddress } from "@aptos-labs/ts-sdk";
import { Selections, userInputs } from "./src/workflow.js";

console.log(
    lightBlue(`
                                                                               ./&@@@@@%*                   /%@@@#,
            @@.               #@@@@@@@@@@@@@*   (@@@@@@@@@@@@@@@@@@@@%     *@@@@@@@@@@@@@@@@@           *@@@@/..,@@@@@
           @@@@/              #@@*        /@@@           /@@(            /((((((((((((((*   *((*       ,@@@         %
          @@/ @@&             #@@*         @@@,          /@@(                         (@               .@@@
        ,@@,   &@@            #@@*         @@@           /@@(          @@@@@@@@@@@@@@@@@@@@@@@@@@@      .@@@@&.
       (@@      /@@           #@@#////#%@@@@&            /@@(                                              ,@@@@@@&
      %@@        .@@,         #@@@&&&&&&/                /@@(                    @@,                             &@@@@.
     @@@@@@@@@@@@@@@@#        #@@*                       /@@(          @@@@@@@@@%@@@@@@@@@@@@@@@@&                  @@@%
    @@%             @@@       #@@*                       /@@(                                            ,          .@@@
  .@@&               @@@      #@@*                       /@@(              &@@/                        @@@@        .@@@,
 #@@%                 @@@     #@@*                       /@@(               .@@@@@@@@@@@@@@@             %@@@@@@@@@@@/
`)
);
console.log("Welcome to the Aptos Blueprint wizard 🔮");

async function main() {

    const mainnet = new Aptos(new AptosConfig({ network: Network.MAINNET }));
    const addresses = [
        AccountAddress.ONE,
        AccountAddress.THREE,
        AccountAddress.FOUR,
        // AccountAddress.fromRelaxed("0xabcde341afbc4d846a4453bf042dffe74a137c0f0b50c548a87f726f4b1d62ed"),
        // AccountAddress.fromRelaxed("0x2cca48b8b0d7f77ef28bfd608883c599680c5b8db8192c5e3baaae1aee45114c"),
        AccountAddress.fromRelaxed("0x7e783b349d3e89cf5931af376ebeadbfab855b3fa239b7ada8f5a92fbea6b387"),
        AccountAddress.fromRelaxed("0x7d7e436f0b2aafde60774efb26ccc432cf881b677aca7faaf2a01879bd19fb8"),
    ];

    let i = 0;
    console.time("start fetching getAccountModules")
    for (const address of addresses) {
        const modules = await mainnet.getAccountModules({ accountAddress: address});
        i += 1;
    }
    console.time("done fetching getAccountModules, fetched" + i + " modules");

    // const selections = await userInputs();
    const selections: Selections = {
        configPath: "./tests/config.yaml",
        additionalModules: [
            // AccountAddress.fromRelaxed("0xabcde341afbc4d846a4453bf042dffe74a137c0f0b50c548a87f726f4b1d62ed"), // monsters
            // AccountAddress.fromRelaxed("0x2cca48b8b0d7f77ef28bfd608883c599680c5b8db8192c5e3baaae1aee45114c"), // tx args module
            AccountAddress.fromRelaxed("0x7e783b349d3e89cf5931af376ebeadbfab855b3fa239b7ada8f5a92fbea6b387"), // pyth
            AccountAddress.fromRelaxed("0x7d7e436f0b2aafde60774efb26ccc432cf881b677aca7faaf2a01879bd19fb8"), // switchboard
        ],
        frameworkModules: [ AccountAddress.ONE, AccountAddress.THREE, AccountAddress.FOUR ], 
        // frameworkModules: [],
        network: Network.MAINNET,
    }
    const codeGeneratorConfig = getCodeGenConfig(selections.configPath);
    const codeGenerator = new CodeGenerator(codeGeneratorConfig);
    const aptosConfig = new AptosConfig({ network: selections.network });
    const aptos = new Aptos(aptosConfig);
    await codeGenerator.generateCodeForModules(
        aptos,
        [...selections.frameworkModules, ...selections.additionalModules],
    );
}

main().catch((e) => {
    console.error(e);
});
