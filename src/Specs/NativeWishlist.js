import codegenNativeCommands from 'react-native/Libraries/Utilities/codegenNativeCommands';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';
export const Commands = codegenNativeCommands({
    supportedCommands: ['scrollToItem'],
});
export default codegenNativeComponent('MGWishlist', {
    interfaceOnly: true,
});
