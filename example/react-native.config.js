/**
 * Keep this file minimal: `react-native-wishlist` is already declared in package.json
 * as `"link:../"`. A second entry here under the name `wishlist` pointed at the same
 * native code and caused CMake to run `add_subdirectory(... wishlist_autolinked_build)`
 * twice with different source paths (duplicate binary dir error).
 */
module.exports = {};
