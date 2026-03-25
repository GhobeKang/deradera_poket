function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    // POST JSON 데이터 처리 (사진 업로드 등)
    if (e.postData && e.postData.contents) {
      try {
        var body = JSON.parse(e.postData.contents);
        if (body.action === 'uploadPhoto') {
          return uploadPhotoToDrive(body);
        } else if (body.action === 'save') {
          return saveData(body.data);
        }
      } catch (err) {
        // 단순 JSON이 아닐 경우 넘어감
      }
    }

    var action = e.parameter.action;
    
    // CORS 문제를 피하기 위해 JSONP 방식을 사용할 수도 있지만,
    // Google Apps Script는 리디렉션을 통해 일반 fetch GET/POST도 잘 지원합니다.
    if (action === 'save') {
      return saveData(e.parameter.data);
    } else if (action === 'load') {
      return loadData();
    } else if (action === 'checkPwd') {
      return checkPassword(e.parameter.pwd);
    } else if (action === 'changePwd') {
      return changePassword(e.parameter.curPwd, e.parameter.newPwd);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ error: '잘못된 액션입니다.' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 처음 1회 실행하여 구글 드라이브 쓰기/생성 권한을 확실하게 승인받기 위한 용도의 함수
function setup() {
  var dummy = DriveApp.createFile('dummy.txt', '권한 요청용 더미 파일입니다.');
  dummy.setTrashed(true); // 역할이 끝났으니 즉시 휴지통으로 이동
}

function uploadPhotoToDrive(data) {
  try {
    var base64Data = data.base64; // data:image/jpeg;base64,... 형태
    var mimeType = data.mimeType || 'image/jpeg';
    var memberName = data.memberName || '알수없음';
    var uploadType = data.uploadType || 'attendance';
    var typeStr = (uploadType === 'profile') ? '[프로필변경]' : '[출석인증]';
    
    // "data:image/jpeg;base64," 부분을 제거
    var commaIndex = base64Data.indexOf(',');
    if (commaIndex !== -1) {
      base64Data = base64Data.substring(commaIndex + 1);
    }
    
    var decoded = Utilities.base64Decode(base64Data);
    
    // 사용자이름-날짜(연월일_시분초) 형식으로 파일명 생성
    var dateString = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd_HHmmss");
    var fileName = typeStr + "_" + memberName + "-" + dateString;
    
    var blob = Utilities.newBlob(decoded, mimeType, fileName);
    
    // 선생님이 지정하신 특정 폴더 ID
    var folderId = "1DzhY9zvicxya7Ds0DuGq5eNAVNNzPBHI";
    var folder = DriveApp.getFolderById(folderId);
    
    // 해당 폴더 안에 생성
    var file = folder.createFile(blob);
    
    // 누구나 볼 수 있게 권한 설정
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 구글 드라이브 이미지를 웹에서 직접 보여주기 좋은 uc?id= 형식 리턴
    var downloadUrl = "https://drive.google.com/uc?export=view&id=" + file.getId();
    
    // 업로드 시점에 스프레드시트에 [날짜시간, 이름, 파일명, 짧은링크] 로그 누적 기록
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var logSheet = ss.getSheetByName('인증사진_업로드기록');
      if (!logSheet) {
        logSheet = ss.insertSheet('인증사진_업로드기록');
        var logHeader = ['업로드 일시', '팀원 이름', '드라이브 파일명', '사진 바로가기 링크 (더블클릭)'];
        logSheet.appendRow(logHeader);
        logSheet.getRange(1, 1, 1, 4).setBackground('#2ecc71').setFontWeight('bold');
        logSheet.setColumnWidth(1, 150);
        logSheet.setColumnWidth(2, 100);
        logSheet.setColumnWidth(3, 200);
        logSheet.setColumnWidth(4, 300);
      }
      var exactTime = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
      logSheet.appendRow([exactTime, memberName, fileName, downloadUrl]);
    } catch(err) {
      // 기록 실패 시 무시
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, url: downloadUrl }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(e) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function saveData(dataString) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // A1 셀에 전체 데이터를 문자열로 저장합니다.
  sheet.getRange('A1').setValue(dataString);
  
  // B1 셀에 마지막 업데이트 시간을 기록합니다.
  sheet.getRange('B1').setValue(new Date());

  // 팀원 비밀번호 등을 추출하여 보기 쉬운 시트로 저장 (추가)
  try {
    var data = JSON.parse(dataString);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (data.rosterData && data.rosterData.members) {
      var pwdSheetName = '팀원목록_및_비번';
      var pwdSheet = ss.getSheetByName(pwdSheetName);
      if (!pwdSheet) {
        pwdSheet = ss.insertSheet(pwdSheetName);
      }
      pwdSheet.clear();
      
      var header = ['팀ID', '팀명', '순번', '팀원 이름', '비밀번호', '출석(점수)', '스킬설명', '프로필사진URL'];
      pwdSheet.appendRow(header);
      pwdSheet.getRange(1, 1, 1, header.length).setBackground('#f1c40f').setFontWeight('bold');
      
      var teams = data.rosterData.members;
      var teamNames = data.rosterData.teamNames || {};
      
      for (var teamKey in teams) {
        var members = teams[teamKey];
        var tName = teamNames[teamKey] || teamKey;
        for (var i = 0; i < members.length; i++) {
          var m = members[i];
          pwdSheet.appendRow([
            teamKey,
            tName, 
            i + 1, 
            m.name || '', 
            m.userPwd || '(미설정)', 
            m.attendance || 0, 
            m.skill || '',
            m.imgUrl || ''
          ]);
        }
      }
      pwdSheet.autoResizeColumns(1, header.length);
    }
  } catch(e) {
    // 파싱 에러 또는 권한 문제시 무시
  }
  
  return ContentService.createTextOutput(JSON.stringify({ success: true, timestamp: new Date().toString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function loadData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var dataString = sheet.getRange('A1').getValue();
  
  if (!dataString) {
    return ContentService.createTextOutput(JSON.stringify({ gameState: null }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  try {
    var data = JSON.parse(dataString);
    var pwdSheet = ss.getSheetByName('팀원목록_및_비번');
    if (pwdSheet) {
      var rows = pwdSheet.getDataRange().getValues();
      if (rows.length > 1 && rows[0][0] === '팀ID') {
        var newMembers = { 'A': [], 'B': [], 'C': [] };
        var newTeamNames = { 'A': '', 'B': '', 'C': '' };
        
        for (var i = 1; i < rows.length; i++) {
          var r = rows[i];
          var teamKey = r[0]; // 팀ID
          if (!newMembers[teamKey]) continue; // 잘못된 팀ID 무시
          newTeamNames[teamKey] = r[1] || teamKey;
          
          newMembers[teamKey].push({
             name: r[3] || '',
             userPwd: r[4] === '(미설정)' ? '' : String(r[4] || ''),
             attendance: parseInt(r[5]) || 0,
             skill: r[6] || '',
             imgUrl: r[7] || 'https://via.placeholder.com/150/111/fff?text=P'
          });
        }
        
        // A,B,C 각각 배열이 비어있지 않으면 덮어쓰기
        if (newMembers['A'].length > 0) data.rosterData.members['A'] = newMembers['A'];
        if (newMembers['B'].length > 0) data.rosterData.members['B'] = newMembers['B'];
        if (newMembers['C'].length > 0) data.rosterData.members['C'] = newMembers['C'];
        
        if (newTeamNames['A']) data.rosterData.teamNames['A'] = newTeamNames['A'];
        if (newTeamNames['B']) data.rosterData.teamNames['B'] = newTeamNames['B'];
        if (newTeamNames['C']) data.rosterData.teamNames['C'] = newTeamNames['C'];
      }
    }
    dataString = JSON.stringify(data);
  } catch(e) {}
  
  return ContentService.createTextOutput(dataString)
    .setMimeType(ContentService.MimeType.JSON);
}

function checkPassword(pwd) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var realPwd = sheet.getRange('C1').getValue();
  if (realPwd === '') {
    realPwd = '0000';
    sheet.getRange('C1').setValue(realPwd);
  }
  
  if (pwd === String(realPwd)) {
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } else {
    return ContentService.createTextOutput(JSON.stringify({ success: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function changePassword(curPwd, newPwd) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var realPwd = sheet.getRange('C1').getValue();
  if (realPwd === '') {
    realPwd = '0000';
    sheet.getRange('C1').setValue(realPwd);
  }
  
  if (curPwd === String(realPwd)) {
    sheet.getRange('C1').setValue(newPwd);
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } else {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: '현재 비밀번호가 틀렸습니다.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

