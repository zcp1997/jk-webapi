declare module "crypto-js" {
  interface WordArray {
    toString(encoder?: Encoder): string;
  }

  interface Encoder {
    stringify(wordArray: WordArray): string;
    parse(str: string): WordArray;
  }

  interface CryptoJSEncoders {
    Hex: Encoder;
  }

  interface CryptoJSStatic {
    MD5(message: string | WordArray, key?: string | WordArray): WordArray;
    enc: CryptoJSEncoders;
  }

  const CryptoJS: CryptoJSStatic;
  export default CryptoJS;
}
