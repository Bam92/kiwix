const nsIWebProgress = Components.interfaces.nsIWebProgress;
const nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;

/* Restart Kiwix */
function restart(silent) {
    if (silent == true || displayConfirmDialog(getProperty("restartConfirm", getProperty("brand.brandShortName")))) {
	/* Save settings */
	settings.save();

	var applicationStartup = Components.classes["@mozilla.org/toolkit/app-startup;1"]
	    .getService(Components.interfaces.nsIAppStartup);
	applicationStartup.quit(Components.interfaces.nsIAppStartup.eRestart |
				Components.interfaces.nsIAppStartup.eAttemptQuit);
    }
}

/* Quit Kiwix */
function quit() {
    /* Check if an indexing process is currently running */
    if (isIndexing()) {
	if (!displayConfirmDialog(getProperty("abortIndexingConfirm"))) {
	    return;
	}
    }

    /* Save settings */
    settings.save();

    /* Quit the application */
    var applicationStartup = Components.classes['@mozilla.org/toolkit/app-startup;1'].
	getService(Components.interfaces.nsIAppStartup);
    applicationStartup.quit(Components.interfaces.nsIAppStartup.eForceQuit);
}

/* Return the properties object */
function getProperties(brand) {
    var pid = "properties";
    if (brand == true) 
        pid  = "brand" + pid;
    return document.getElementById(pid);
}

/* Return the value of a specific property */
function getProperty(name, parameter1, parameter2) {
    var brand   = false;
    if (name.indexOf("brand.", 0) == 0) {
        name = name.substring("brand.".length);
        brand = true;
    }
    var message = getProperties(brand).getString(name);

    if (parameter1 != undefined) {
	message = message.replace("%1", parameter1)
    }
    
    if (parameter2 != undefined) {
	message = message.replace("%2", parameter2)
    }

    return message;
}

/* Return an application char preference */
function getApplicationCharPreference(name) {
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
	.getService(Components.interfaces.nsIPrefBranch);
    return prefs.getCharPref(name);
}

/* Return an application bool preference */
function getApplicationBoolPreference(name) {
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
	.getService(Components.interfaces.nsIPrefBranch);
    return prefs.getBoolPref(name);
}

/* Return true if the profile should be clean by closing Kiwix */
function doOnCloseClean() {
    return (settings.doOnCloseClean() != undefined ? 
	    settings.doOnCloseClean() : getApplicationBoolPreference("kiwix.removeprofileonclose"));
}

/* Return true if the confirm dialogbox to remove profile should be displayed */
function displayOnCloseCleanConfirmDialog() {
    return (settings.displayOnCloseCleanConfirmDialog() != undefined ?
	    settings.displayOnCloseCleanConfirmDialog() : getApplicationBoolPreference("kiwix.removeprofileonclose.confirm"));
}

/* Return the installation prefix */
function getInstallationPrefix() {
    return getApplicationCharPreference("kiwix.install.prefix");
}
 
/* initialization function */
function onStart() {
    
    /* Include jsm */
    Components.utils.import("resource://modules/env.jsm");
    Components.utils.import("resource://modules/settings.jsm");
    Components.utils.import("resource://modules/library.jsm");

    preInitUserInterface();

    /* Check the XPCOM registration */
    if (Components.classes["@kiwix.org/zimAccessor"] == undefined)
	dump("Unable to register the zimAccessor XPCOM, Kiwix will be unable to read ZIM files.\n");
    if (Components.classes["@kiwix.org/xapianAccessor"] == undefined) {
	dump("Unable to register the xapianAccessor XPCOM, Kiwix will be unable to provide the search engine.\n");
	    displayErrorDialog("You are maybe impacted by a known issue. Please try to install vcredist_x86.exe located in the 'install' directory and restart kiwix.");
    }
    if (Components.classes["@kiwix.org/zimXapianIndexer"] == undefined)
	dump("Unable to register the zimXapianIndexer XPCOM, Kiwix will be unable to index ZIM files.\n");
    if (Components.classes["@kiwix.org/cluceneAccessor"] == undefined)
	dump("Unable to register the cluceneAccessor XPCOM, Kiwix will be unable to provide the Clucene search engine.\n");
    if (Components.classes["@kiwix.org/zimCluceneIndexer"] == undefined)
	dump("Unable to register the zimCluceneIndexer XPCOM, Kiwix will be unable to index ZIM files with Clucene.\n");
    if (Components.classes["@kiwix.org/contentManager"] == undefined)
	dump("Unable to register the contentManager XPCOM, Kiwix will be unable to deal with content.\n");

    /* Remove old profile if necessary */
    var profileToRemove = settings.profileToRemove();
    if (profileToRemove != undefined && profileToRemove != "") {
	try {
	    var profileService = Components.classes["@mozilla.org/toolkit/profile-service;1"]
		.createInstance(Components.interfaces.nsIToolkitProfileService);
	    var oldProfile = profileService.getProfileByName(settings.profileToRemove());
	    oldProfile.remove(true);
	    profileService.flush();
	    settings.profileToRemove("");
	} catch(error) {
	}
    }

    /* Init the event listeners */
    initEventListeners();

    /* Save the current language (necessary if the profile does not exists) */
    settings.locale(getCurrentLocale());

    /* Initialize Bookmarks */
    InitializeBookmarks();

    /* Read the command line arguments */
    var contentLoaded = false;
    var nsCommandLine = window.arguments[0];
    nsCommandLine = nsCommandLine.QueryInterface(Components.interfaces.nsICommandLine);
    var argumentCount = nsCommandLine.length;
    for (var argumentIndex=0; argumentIndex<argumentCount; argumentIndex++) {
	var argument = nsCommandLine.getArgument(argumentIndex);
	if (argument.match(/^.*\.(zim|zimaa)$/i)) {
	    argument = pathFromURL(argument);
	    argument = argument.replace('%20', ' ');
	    contentLoaded = manageOpenFile(argument, true);
	}
    }

    /* Open current book */
    if (!contentLoaded && !openCurrentBook()) {
	library.deleteCurrentBook();
	showHelp();
    }

    /* Initialize the user interface */
    initUserInterface();

    /* Start aria */
    checkDownloader();
}

/* Clear the history and the cache */
function managePurgeHistory() {
    /* cache */
    const cc = Components.classes;
    const ci = Components.interfaces;
    var cacheService = cc["@mozilla.org/network/cache-service;1"]
	.getService(ci.nsICacheService);
    try {
	cacheService.evictEntries(ci.nsICache.STORE_ANYWHERE);
    } catch(er) { L.info (e.toString ()); }

    /* History */
    var globalHistory = Components.classes["@mozilla.org/browser/global-history;2"]
	.getService(Components.interfaces.nsIBrowserHistory);
    globalHistory.removeAllPages();
    
    try {
	var os = Components.classes["@mozilla.org/observer-service;1"]
	    .getService(Components.interfaces.nsIObserverService);
	os.notifyObservers(null, "browser:purge-session-history", "");
    }
    catch (e) { L.info (e.toString ()); }

    /* Update the back/next buttons */
    desactivateBackButton();
    desactivateNextButton();

    /* Update the htmlrenderers */
    var tabPanels = document.getElementById("tab-panels");
    for (var tabPanelIndex = 0; tabPanelIndex<tabPanels.children.length; tabPanelIndex++) {
	var htmlRenderer = tabPanels.children[tabPanelIndex].firstChild;
	htmlRenderer.reload();
    }
}

/* Things to do before exit Kiwix */
function onClose() {

    /* Stop downloader */
    stopDownloader();

    var doClean = doOnCloseClean();
    if (env.isLive()) {

	/* Ask before removing */
	if (displayOnCloseCleanConfirmDialog()) {

	    /* Prepare the strings for the confirm dialog box */
	    var title = getProperty("confirm");
	    var message = getProperty("removeProfileConfirm");
	    var ok = getProperty("ok");
	    var cancel = getProperty("cancel");
	    var checkMessage = getProperty("dontDisplayAnymore");

	    /* Prepare the confirm dialog box */
	    var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
		.getService(Components.interfaces.nsIPromptService);
	    
	    /* Prepare the buttons */
	    var flags = prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING +
		prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_IS_STRING;
	    
	    /* Prepare the check box */
	    /* Default the checkbox to false */
	    var check = {value: false};

	    /* Display the confirm dialog and get the values back */
	    var doClean = (prompts.confirmEx(null, title, message, flags, ok, cancel, "", checkMessage, check) == 0);
	    var doDisplay = !check.value;
	    
	    /* Save the values in the settings */
	    settings.displayOnCloseCleanConfirmDialog(doDisplay);
	    if (!doDisplay) {
		settings.doOnCloseClean(doClean);
	    }
	}

	/* Clean the profile if necessary */
	if (doClean) {
	    /* Remove the library */
	    library.delete();

	    /* Bookmarks */
	    try {
		purgeBookmarks();
	    } catch (e) { L.info (e.toString ()); }
	    
	    /* History */
	    var globalHistory = Components.classes["@mozilla.org/browser/global-history;2"]
		.getService(Components.interfaces.nsIBrowserHistory);
	    globalHistory.removeAllPages();
	    
	    try {
		var os = Components.classes["@mozilla.org/observer-service;1"]
		    .getService(Components.interfaces.nsIObserverService);
		os.notifyObservers(null, "browser:purge-session-history", "");
	    }
	    catch (e) { L.info (e.toString ()); }
	    
	    /* Clear last URL of the Open Web Location dialog */
	    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
		.getService(Components.interfaces.nsIPrefBranch2);
	    try {
		prefs.clearUserPref("general.open_location.last_url");
	    }
	    catch (e) { }
	    
	    /* cache */
	    const cc = Components.classes;
	    const ci = Components.interfaces;
	    var cacheService = cc["@mozilla.org/network/cache-service;1"]
		.getService(ci.nsICacheService);
	    try {
		cacheService.evictEntries(ci.nsICache.STORE_ANYWHERE);
	    } catch(er) { L.info (e.toString ()); }
	    
	    /* cookies (shouldn't be any) */
	    L.info ('purging Cookies');
	    var cookieMgr = Components.classes["@mozilla.org/cookiemanager;1"]
		.getService(Components.interfaces.nsICookieManager);
	    cookieMgr.removeAll();

	    /* delete settingsDirectoryRoot */
	    var directoryService = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties);
	    var settingsDirectory = directoryService.get("DefProfRt", Components.interfaces.nsIFile);
	    var settingsDirectoryRoot = settingsDirectory.parent.clone();
	    dump("Removing whole kiwix profile " + settingsDirectoryRoot.path + "\n");
	    settingsDirectoryRoot.remove(true);
	}
    }
}

/* Load the page with the external browser */
function openUrlWithExternalBrowser(url) {
    var ioService = Components.classes["@mozilla.org/network/io-service;1"].
	getService(Components.interfaces.nsIIOService);
    var resolvedUrl = ioService.newURI(url, null, null);
    var externalProtocolService = Components.
	classes["@mozilla.org/uriloader/external-protocol-service;1"].
	getService(Components.interfaces.nsIExternalProtocolService);
    externalProtocolService.loadURI(resolvedUrl, null);
}

/* Check if a directory exists */
function isDirectory(path) {
    var file = Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsILocalFile);
    file.initWithPath(path);
    
    return (file.exists() && file.isDirectory());
}

/* Return the size of a file */
/* TODO: Buggy with large files and 32 bits */
function getFileSize(path) {
    var fileService = Components.classes["@mozilla.org/file/local;1"].createInstance();
    if (fileService instanceof Components.interfaces.nsILocalFile) {
	fileService.initWithPath(path);
	return fileService.fileSize;
    }
}

/* Delete a file or a directory */
function deleteFile(path) {
    try {
	var fileService = Components.classes["@mozilla.org/file/local;1"].createInstance();
	if (fileService instanceof Components.interfaces.nsILocalFile) {
	    fileService.initWithPath(path);
	    return fileService.remove(true);
	}
    } catch(error) {
	return false;
    }
    return true;
}

/* Move a file or a directory */
function moveFile(filePath, newDirectory, newName) {
    var fileService = Components.classes["@mozilla.org/file/local;1"].createInstance();
    var directoryService = Components.classes["@mozilla.org/file/local;1"].createInstance();

    if (fileService instanceof Components.interfaces.nsILocalFile &&
	directoryService instanceof Components.interfaces.nsILocalFile) {
	fileService.initWithPath(filePath);
	directoryService.initWithPath(newDirectory);
	return fileService.moveTo(directoryService, newName);
    }
}

/* Check if a file exists */
function isFile(filePath) {
    var fileService = Components.classes["@mozilla.org/file/local;1"].createInstance();
    if (fileService instanceof Components.interfaces.nsILocalFile) {
	fileService.initWithPath(filePath);
	return fileService.exists();
    }
}

/* Write content to a file */
function writeFile(path, content) {
    Components.utils.import("resource://gre/modules/NetUtil.jsm");
    Components.utils.import("resource://gre/modules/FileUtils.jsm");

    var file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
    file.initWithPath(path);
    var ostream = FileUtils.openSafeFileOutputStream(file)
    var converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].
        createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
    converter.charset = "UTF-8";
    var istream = converter.convertToInputStream(content);
    NetUtil.asyncCopy(istream, ostream);
}

/* Read content from a file */
function readFile(path) {
    var file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
    file.initWithPath(path);
    var ios = Components.classes["@mozilla.org/network/io-service;1"].
        getService(Components.interfaces.nsIIOService);
    var istream = Components.classes["@mozilla.org/network/file-input-stream;1"].
        createInstance(Components.interfaces.nsIFileInputStream);
    istream.init(file, -1, -1, false);
    var bstream = Components.classes["@mozilla.org/binaryinputstream;1"].
        createInstance(Components.interfaces.nsIBinaryInputStream);
    bstream.setInputStream(istream);
    
    return bstream.readBytes(bstream.available());
}

/* Decode URL */
function decodeUrl (text) {
    var string = "";
    var i = 0;
    var c = 0;
    var c1 = 0;
    var c2 = 0;
    var utftext = unescape(text);
    
    while ( i < utftext.length ) {
	
  	   c = utftext.charCodeAt(i);
		
	   if (c < 128) {
	       string += String.fromCharCode(c);
	       i++;
	    } else if((c > 191) && (c < 224)) {
	 	      c2 = utftext.charCodeAt(i+1);
		      string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
		      i += 2;
	    } else {
		    c2 = utftext.charCodeAt(i+1);
		    c3 = utftext.charCodeAt(i+2);
		    string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
		    i += 3;
	    }	
    }    
    return string;
}

/* Merge two path, this is essential for the compatibility between nix & win */
function appendToPath(path, file) {
    var dir = Components.classes["@mozilla.org/file/local;1"] 
                       .createInstance(Components.interfaces.nsILocalFile);
    dir.initWithPath(path);
    dir.append(file);
    return dir.path;
}

function WarnOnSideBar () {
    
    if (env.isLive() && _firstSideBar) {
	_firstSideBar = false;
	
	var strbundle			= document.getElementById ("strings");
	var welcomeAlertTitle	= strbundle.getString ("welcomeAlertTitle");	
	var welcomeAlert		= strbundle.getString ("welcomeAlert");	
	
	var prompt = Components.classes["@mozilla.org/network/default-prompt;1"].createInstance(Components.interfaces.nsIPrompt);
	prompt.alert (welcomeAlertTitle, welcomeAlert);
    }
}

/* Return a random string */
function randomString() {
    var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
    var string_length = 8;
    var randomstring = '';
    for (var i=0; i<string_length; i++) {
	var rnum = Math.floor(Math.random() * chars.length);
	randomstring += chars.substring(rnum,rnum+1);
    }
    return randomstring;
}

/* Returns the root path of the binary if found, undefined otherwise */
function whereis(binary) {
    var pathArray = env.getPath().split(env.isWindows() ? ";" : ":");
    var directory = Components.classes["@mozilla.org/file/local;1"].
           createInstance(Components.interfaces.nsILocalFile);

    for (var i in pathArray) {
	try {
	    directory.initWithPath(pathArray[i]);
	    directory.append(binary);
	    if (directory.exists()) {
		return directory.path;
	    }
	} catch (error) {
	}
    }
}

function delay (f, t) {
    setTimeout(f, t || 0);
}

function pathFromURL(aURL) {
    if (!aURL.match(/^file\:\/\//)) {
        return aURL;
    }
    var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                              .getService(Components.interfaces.nsIIOService);
    var baseURI = ioService.newURI(aURL, null, null);
    return baseURI.path;
}