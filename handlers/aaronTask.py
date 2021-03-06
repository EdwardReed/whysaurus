import os
import logging
import re
from random import randint

from google.appengine.ext.webapp import template
from google.appengine.ext import ndb
from google.appengine.ext import deferred
from google.appengine.ext.ndb import metadata

from authhandler import AuthHandler
from models.point import PointRoot
from models.point import Point
from models.point import Link
from models.privateArea import PrivateArea
from models.follow import Follow
from models.comment import Comment

from models.whysaurususer import WhysaurusUser

from google.appengine.api import search
from google.appengine.api.taskqueue import Task
from google.appengine.api import namespace_manager
    
from handlers.dbIntegrityCheck import DBIntegrityCheck

from google.appengine.api import namespace_manager


def IndClearLowQualityFlags(cursor=None, num_updated=0, batch_size=250, cntUpdatedNet=0, namespace=None, namespaces=None):
    logging.info('ClearLowQuality Update: Start: %d  Batch: %d  Namespace: %s' % (num_updated, batch_size, namespace))

    if namespace:
        previous_namespace = namespace_manager.get_namespace()
        namespace_manager.set_namespace(namespace)
    else:
        previous_namespace = None

    try:
        query = Point.query()
        points, next_cursor, more = query.fetch_page(batch_size, start_cursor=cursor)

        cnt = 0
        cntSkip = 0
        cntUpdate = 0
        # for p in query.iter():
        for p in points:
            cnt += 1

            # if p.isLowQualityAdmin == False:
            #     cntSkip += 1
            #     continue
            if p.isLowQualityAdmin:
                cntUpdate += 1
            p.isLowQualityAdmin = False
            p.put()

        logging.info('ClearLowQuality Incremental: Count: %d  Updated: %d  Skipped: %d' % (cnt, cntUpdate, cntSkip))
    finally:
        if previous_namespace:
            namespace_manager.set_namespace(previous_namespace)

    # If there are more entities, re-queue this task for the next page.
    if more:
        deferred.defer(IndClearLowQualityFlags,
                       cursor=next_cursor,
                       num_updated=(num_updated + cnt),
                       batch_size=batch_size,
                       cntUpdatedNet=(cntUpdatedNet + cntUpdate),
                       namespace=namespace,
                       namespaces=namespaces)
    else:
        logging.warning('ClearLowQuality Complete! - Net Updated: %d  Namespace: %s' % (cntUpdatedNet + cntUpdate, namespace))

        if namespaces and len(namespaces) > 0:
            nextNamespace = namespaces[0]
            del namespaces[0]
            logging.warning('ClearLowQuality: Next Namespace: %s  Count: %d' % (nextNamespace, len(namespaces)))
            deferred.defer(IndClearLowQualityFlags,
                           cursor=None,
                           num_updated=0,
                           batch_size=batch_size,
                           cntUpdatedNet=0,
                           namespace=nextNamespace,
                           namespaces=namespaces)

def IndUpdatePointsAllNamespace():
    namespaces = [namespace for namespace in metadata.get_namespaces()]
    logging.warning('%d Namespaces To Query: %s' % (len(namespaces), namespaces[0]))
    assert (namespaces[0] == "")
    if len(namespaces) == 1:
        namespaces = None
    else:
        del namespaces[0]

    IndClearLowQualityFlags(namespaces=namespaces)
    
def ChangeUserUrl(cursor=None, num_updated=0, batch_size=250, cntUpdatedNet=0, namespace=None, namespaces=None):
    logging.info('ChangeUserUrl Update: Start: %d  Batch: %d  Namespace: %s' % (num_updated, batch_size, namespace))

    query = Point.query()
    points, next_cursor, more = query.fetch_page(batch_size, start_cursor=cursor)

    cnt = 0
    cntSkip = 0
    cntUpdate = 0
    # for p in query.iter():
    for p in points:
        cnt += 1

        if p.authorURL != 'Tom_Gratian' and p.authorURL != 'tom_gratian' and p.creatorURL != 'Tom_Gratian' and p.creatorURL != 'tom_gratian':
            continue

        logging.warning('ChangeUserUrl: Update: %s  Author -> (%s, %s)' % (p.url, p.authorName, p.authorURL))
        
        p.authorName = 'Big T'
        p.creatorName = 'Big T'
        p.put()
            
        cntUpdate += 1
        # p.isLowQualityAdmin = False
        # p.put()

    logging.info('ChangeUserUrl Incremental: Count: %d  Updated: %d  Skipped: %d' % (cnt, cntUpdate, cntSkip))
    
    # If there are more entities, re-queue this task for the next page.
    if more:
        deferred.defer(ChangeUserUrl,
                       cursor=next_cursor,
                       num_updated=(num_updated + cnt),
                       batch_size=batch_size,
                       cntUpdatedNet=(cntUpdatedNet + cntUpdate),
                       namespace=namespace,
                       namespaces=namespaces)
    else:
        logging.warning('ChangeUserUrl Complete! - Net Updated: %d  Namespace: %s' % (cntUpdatedNet + cntUpdate, namespace))

# One-off tasks for changing DB stuff for new versions
class AaronTask(AuthHandler):
    def CalculateTopPoints(self):
        prs = PointRoot.query()
        for pr in prs.iter():
            pr.setTop()

    def QueueTask(self):
        taskurl = self.request.get('task')
        if taskurl:
            fullurl = '/' + taskurl
            t = Task(url=fullurl)
            t.add(queue_name="notifications")
            self.response.out.write('OK I wrote %s to the notifications queue' % fullurl)     
        else:
            self.response.out.write('Need a task URL parameter')     

     
    def DeleteDuplicateFollows(self):
        q = Follow.query()
        i = 0 
        for f in q.iter():
            i = i+1
            q2 = Follow.query(ndb.AND(Follow.user == f.user, Follow.pointRoot == f.pointRoot))     
            existingFollows = q2.fetch(4)
            if len(existingFollows) > 1:
                for ef in existingFollows[1:]:
                    logging.info('Deleting follow for R:%s U:%s T:%s' % (str(ef.pointRoot), str(ef.user), ef.reason))
                    ef.key.delete()
        logging.info('Checked %d follows' % i)

    def pointRootLinkChange(self, pointRoot):
        pointRootKey = pointRoot.key                      
        points = pointRoot.getAllVersions()
        logging.info('- - - - Processing root for %s' % pointRoot.url)
        

        
        for point in points:            
            if (point.supportingLinks != []) or (point.counterLinks != []):
                logging.info('- - --- - - - - - Skipping version %d' % point.version)                
                continue # make sure we don't write twice
            
            for linkType in ('supporting', 'counter'):  
                structuredLinkCollection  = []   
                logging.info('Getting root collections for version %d, link Type: %s' % (point.version, linkType))
                
                # THIS FUNCTION HAS NOW BEEN DEPRECATED AND REMOVED FROM THE CODE
                rootColl, versionColl = point.getLinkCollections(linkType)
                for rootLink, vLink in zip(rootColl, versionColl):
                    newLink = Link()
                    newLink.version = vLink
                    newLink.root = rootLink
                    newLink.voteCount = 0
                    structuredLinkCollection = structuredLinkCollection + [newLink]
                    point.setStructuredLinkCollection(linkType, structuredLinkCollection)
            point.put()               
            
    def pointRootArchiveComments(self, pointRoot):
        if pointRoot.comments:
            pointRoot.archivedComments = pointRoot.comments
            pointRoot.comments = []
            pointRoot.put()
            logging.info('Archived %d comments in %s' % (pointRoot.numArchivedComments, pointRoot.url))

                  
    """
    # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    GENERIC FUNCTION FOR DOING SOMETHING TO EVERY POINT ROOT
       Will do 10 roots, then call a URL which is expected to 
       call the function again.
       firstURL is the point to (re)start the execution with
    # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 
    """  
    def pointRootsMap(self, f, taskURL, firstURL = None):
        nextURL = None        
        query = PointRoot.query().order(PointRoot.url)
                        
        if firstURL:
            query = query.filter(PointRoot.url >= firstURL)
            
        pointRoots = query.fetch(11)
        if len(pointRoots) == 11:
            nextURL = pointRoots[-1].url
            pointRootsToReview = pointRoots[:10]
        else:
            pointRootsToReview = pointRoots   
        
        for pointRoot in pointRootsToReview:
            f(pointRoot)
            
        if nextURL:
            t = Task(url=taskURL, params={'nexturl':nextURL})
            t.add(queue_name="notifications")
            logging.info('Requeing task to start at url %s ' % nextURL)            

    """
    # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    COPY LINK INFORMATION INTO STRUCTURED PROPERTIES
    # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 
    """
    def MakeLinks(self):
        firstURL = self.request.get('nexturl') 
               
        self.pointRootsMap(
            f=self.pointRootLinkChange, 
            taskURL='/job/MakeLinks',
            firstURL=firstURL if firstURL else None)
            

    """
    # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    ARCHIVE ALL COMMENTS
    # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 
    """
    def ArchiveAllComments(self):
        firstURL = self.request.get('nexturl') 
               
        self.pointRootsMap(
            f=self.pointRootArchiveComments, 
            taskURL='/job/ArchiveAllComments',
            firstURL=firstURL if firstURL else None)
            
            
         
    def MakeLinksAllAreas(self):
        q = PrivateArea.query()
        for pa in q.iter():
            logging.info("Kicking off the make links for private area: " + pa.name)
            namespace_manager.set_namespace(pa.name)         
            self.MakeLinks()
        # THE MAIN ONE WOULD GO HERE
        
    """
    # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    CHECK EACH POINT IN THE MAIN NAMESPACE
    # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 
    """ 
    def DBCheck(self):
        firstURL = self.request.get('nexturl')        
        self.pointRootsMap(
            f=DBIntegrityCheck.checkDBPointRoot, 
            taskURL='/job/DBCheck',
            firstURL=firstURL if firstURL else None)
                   
    def MakeFollows(self):
        """
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        ADD FOLLOWS FOR ADMIN USERS
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 
        """
        nextURL = None
        firstURL = self.request.get('nexturl')
        query = PointRoot.query().order(PointRoot.url)
        if firstURL:
            query = query.filter(PointRoot.url >= firstURL)
        pointRoots = query.fetch(11)
        if len(pointRoots) == 11:
            nextURL = pointRoots[-1].url
            pointRootsToReview = pointRoots[:10]
        else:
            pointRootsToReview = pointRoots
        
        i = 0
        for pointRoot in pointRootsToReview:
            pointRootKey = pointRoot.key
            followers = {}     
                          
            versions = pointRoot.getAllVersions()
            for point in versions:
                if point.version == 1:
                    followers[point.authorURL] = 'created'         
                elif not point.authorURL in followers:
                    followers[point.authorURL] = 'edited'  
            
            for comment in pointRoot.getComments():
                if not comment.userUrl in followers:
                    followers[comment.userUrl] = 'commented'  
                
            logging.info('ROOT: %s FOLLOWERS: %s' % (pointRoot.url, str(followers)))       
            for url in followers.iterkeys():
                followType = followers[url]
                previousNamespace = namespace_manager.get_namespace()
                if previousNamespace and previousNamespace != '':                
                    namespace_manager.set_namespace('') # DEFAULT NAMESPACE
                    usr = WhysaurusUser.getByUrl(url)
                    namespace_manager.set_namespace(previousNamespace)
                else:
                    usr = WhysaurusUser.getByUrl(url)
                logging.info('Trying to follow for U:%s, R:%s, T:%s' % (url, pointRoot.url, followType))
                f = None
                f = Follow.createFollow(usr.key, pointRootKey, followType)
                if f:
                    i = i + 1
                    logging.info('ADDED follow for U:%s, R:%s, T:%s' % (url, pointRoot.url, followType))

                       
        logging.info('Added %d follows' % i)
        if nextURL:
            t = Task(url="/MakeFollows", params={'nexturl':nextURL})
            t.add(queue_name="notifications")
            logging.info('Requeing MakeFollows task to start at url %s ' % nextURL)
        
    def PopulateCreators(self):
        prs = PointRoot.query()
        cnt = 0
        bypassed = 0;
        for pr in prs.iter():
            updated = pr.populateCreatorUrl()
            if updated:
                # Just run one for now..
                cnt += 1
                if cnt > 250:
                    logging.warn('Populate Update Stop - Updated: %d Bypassed: %d' % (cnt, bypassed))
                    return
            else:
                bypassed += 1

        logging.warn('Populate Update Complete! - Updated: %d Bypassed: %d' % (cnt, bypassed))

    def PopulateGaids(self):
        maxCreates = 250
        bigMessage = ['Populating GA Ids']
        gaIds = []

        query = WhysaurusUser.query()
        for yUser in query.iter():
            if yUser.gaId is None:
                continue
            gaIds.append(yUser.gaId)

        bigMessage.append('Existing gaIds: %s' % (len(gaIds)))

        cntNewIds = 0
        query = WhysaurusUser.query()
        for yUser in query.iter():
            if yUser.gaId is not None:
                continue

            newId = yUser.generateUserGaid(isNewUser=False, existingGaids=gaIds)

            if newId is None:
                bigMessage.append('User %s (%s) failed generation: %s' % (yUser.name, str(yUser.auth_ids), yUser.gaId))
                continue

            yUser.put()

            bigMessage.append('User %s (%s) got gaId: %s' % (yUser.name, str(yUser.auth_ids), yUser.gaId))

            cntNewIds += 1
            if cntNewIds >= maxCreates:
                break

        bigMessage.append('Generated %s new gaIds' % (cntNewIds))

        template_values = {
            'messages': bigMessage
        }
        path = os.path.join(os.path.dirname(__file__), '../templates/django/message.html')
        self.response.out.write(template.render(path, template_values))
        

    def UpdateUserName(self, userUrl, userName):
        maxUpdates = 1
        bigMessage = ['Populating user name (%s): %s' % (userUrl, userName)]
        
        updates = 0
        query = WhysaurusUser.query()
        for yUser in query.iter():
            if yUser.url != userUrl:
                continue
            bigMessage.append('Changing user name (%s / %s): %s' % (yUser.url, yUser.name, userName))
            yUser.name = userName
            yUser.put()
            updates += 1
            
        bigMessage.append('Users: %s' % (updates))

        template_values = {
            'messages': bigMessage
        }
        path = os.path.join(os.path.dirname(__file__), '../templates/django/message.html')
        self.response.out.write(template.render(path, template_values))

    def get(self):
        # self.PopulateGaids()
        # deferred.defer(IndClearLowQualityFlags)
        # deferred.defer(IndUpdatePointsAllNamespace)
        # self.UpdateUserName('Tom_Gratian', 'Big T')
        # ChangeUserUrl()
        self.response.write("""
            Schema update started. Check the console for task progress. 
            <a href="/">View entities</a>.
            """)

        """
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        TEST USERS
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 
        query = WhysaurusUser.query()
        bigMessage = []
        for yUser in query.iter():
            bigMessage.append('USER: %s' % str(yUser))
            
        template_values = {
            'messages': bigMessage
        }    
        path = os.path.join(os.path.dirname(__file__), '../templates/message.html')
        self.response.out.write(template.render(path, template_values))   
        
            
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        FILL EDITED AND CREATED ARRAYS ON USERS
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 
        
        HTTP_RE = re.compile('^https?:\/\/')
        query = PointRoot.query()
        bigMessage = []
        for pointRoot in query.iter():
            point = pointRoot.getCurrent()            
            if HTTP_RE.match(point.imageURL):
                bigMessage.append('+++++++++ Point %s MATCHED: %s' % (point.title, point.imageURL))
            else:
                bigMessage.append('Point %s did not match: %s' % (point.title, point.imageURL))

        template_values = {
            'messages': bigMessage
        }    
        path = os.path.join(os.path.dirname(__file__), '../templates/message.html')
        self.response.out.write(template.render(path, template_values))   
        
            
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        FILL EDITED AND CREATED ARRAYS ON USERS
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 
        bigMessage = ['STARTING THE WORK']
        users = {}
        query = Point.query()
        for point in query.iter():
            usr = WhysaurusUser.getByUrl(point.authorURL)
            pointRootKey = point.key.parent()
            if point.version == 1:
                if not pointRootKey in usr.createdPointRootKeys:
                    # usr.recordCreatedPoint(pointRootKey)
                    bigMessage.append('User %s created %s' % (usr.name, point.title))
                else:
                    bigMessage.append('User %s created %s (ALREADY RECORDED)' % (usr.name, point.title))
            else:
                users[usr.url] = usr.recordEditedPoint(point.key.parent(), False)
                bigMessage.append('User %s edited %s' % (usr.name, point.title))
                                
        for usrUrl, keys in users.iteritems():
            usr = WhysaurusUser.getByUrl(usrUrl)
            usr.editedPointRootKeys = keys
            usr.put()
            bigMessage.append('Writing OUT User %s' % usrUrl)
            
        template_values = {
            'messages': bigMessage
        }    
        path = os.path.join(os.path.dirname(__file__), '../templates/message.html')
        self.response.out.write(template.render(path, template_values))   
        
            
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        GATHER AUTHOR NAMES FROM POINTS 
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 
        bigMessage = ['STARTING THE WORK']
        namesMap = {
            'frankelfrankel':'frankelfrankel2',
            'Aaron Lifshin':'Aaron_Lifshin3',
            'Joshua Frankel':'Joshua_Frankel',
            'Colin Curtin':'Colin_Curtin1',
            'Masha Lifshin':'Masha_Lifshin',
            'Yuan Hou':'Yuan_Hou',
            'Anatoly Volovik':'Anatoly_Volovik',
            'Whysaurus':'Whysaurus',
            'Max Lifshin':'Max_Lifshin',
            'Gavin Guest':'Gavin_Guest1',
            'Eve Biddle':'Eve_Biddle',
            'Leva Pushkin':'Leva_Pushkin1'              
        }
        # authorNames = {}
        query = Point.query()
        for point in query.iter():
            if point.authorName in namesMap:
                bigMessage.append('Name in map: |%s|. Assigning %s' % (point.authorName, namesMap[point.authorName]))
                point.authorURL = namesMap[point.authorName]
                point.put()
            else:
                bigMessage.append(' +++++++++ Name not in map: |%s|.' % point.authorName)
            
        # for k,v in authorNames.iteritems():
        #    bigMessage.append('Name |%s|: Count %d' % (k, v))
            
        template_values = {
            'messages': bigMessage
        }    
        path = os.path.join(os.path.dirname(__file__), '../templates/message.html')
        self.response.out.write(template.render(path, template_values))   
        
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        CREATE URLS FOR USERS
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 
        bigMessage = ['STARTING THE WORK']
        query = WhysaurusUser.query()
        for yUser in query.iter():
            yUser.url = WhysaurusUser.constructURL(yUser.name)
            yUser.put()
            bigMessage.append('User %s (%s) got URL %s' % (yUser.name, str(yUser.auth_ids), yUser.url))
            
        template_values = {
            'messages': bigMessage
        }    
        path = os.path.join(os.path.dirname(__file__), '../templates/message.html')
        self.response.out.write(template.render(path, template_values))   
            
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        REBUILD SEARCH INDEX 
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ 
        query = PointRoot.query()
        bigMessage = []
        i = 0
        doc_index = search.Index(name="points")

        for pointRoot in query.iter():                     
            doc = doc_index.get(pointRoot.key.urlsafe())
            if doc is None:
                pointRoot.getCurrent().addToSearchIndexNew()
                bigMessage.append('Added %s' % pointRoot.url)
            i = i + 1

        bigMessage.append("Insertions made: %d" % i)

        template_values = {
            'message': bigMessage
        }
        path = os.path.join(os.path.dirname(__file__), '../templates/message.html')
        self.response.out.write(template.render(path, template_values))
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        REMOVE SOME BAD LINKS 
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++    
        bigMessage = ['STARTING THE WORK']
        query = PointRoot.query()
        i = 0
        for pointRoot in query.iter():
            i = i + 1
            for linkRootKey in pointRoot.pointsSupportedByMe:
                linkRoot = linkRootKey.get()
                if not linkRoot:
                    pointRoot.pointsSupportedByMe.remove(linkRootKey)
                    pointRoot.put()
                    bigMessage.append("++++++  Removed %s from %s " % (linkRootKey, pointRoot.url))
                    
        bigMessage.append('Processed %d point roots' % i)          
        template_values = { 'message': bigMessage }
        path = os.path.join(os.path.dirname(__file__), '../templates/message.html')
        self.response.out.write(template.render(path, template_values))               

                    
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        CLEAR FROM SEARCH INDEX ANYTHING THAT NO LONGER HAS A MATCHING POINT
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++                    
        bigMessage = []
        docIndex = search.Index(name="points")
        docIds = [d.doc_id for d in docIndex.get_range(limit=200, ids_only=True)]
        for docId in docIds:
            pointRoot = None
            try:
                pointRoot = ndb.Key(urlsafe=docId).get()
            except Exception as e:
                logging.info(
                    'Could not retrieve from doc ID %s. Error was: %s' % (docId, str(e)))
            if pointRoot:
                bigMessage.append("Found %s" % pointRoot.url)
            else:
                docIndex.delete(docId)
                bigMessage.append("Deleted %s" % docId)
        template_values = { 'message': bigMessage }
        path = os.path.join(os.path.dirname(__file__), '../templates/message.html')
        self.response.out.write(template.render(path, template_values))               

        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        REDO THE SEARCH INDEX SO THAT THE DOCID IS THE URLSAFE OF THE POINTROOT
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

        query = PointRoot.query()
        bigMessage = []
        i = 0
        doc_index = search.Index(name="points")

        for pointRoot in query.iter():                     
            doc_index.delete(pointRoot.url)
            bigMessage.append('Removing %s' % pointRoot.url)
            pointRoot.getCurrent().addToSearchIndexNew()
            bigMessage.append('Added %s' % pointRoot.url)
            i = i + 1

        bigMessage.append("Insertions made: %d" % i)

        template_values = {
            'message': bigMessage
        }
        path = os.path.join(os.path.dirname(__file__), '../templates/message.html')
        self.response.out.write(template.render(path, template_values))
        
            
        MAKE ALL ROOTS HAVE A CURRENT
        
        query = PointRoot.query()
        i = 0
        for pointRoot in query.iter():            
            point = Point.query(Point.current == True, ancestor=pointRoot.key).get()
            pointRoot.current = point.key
            pointRoot.put()
            i = i+1
          
        template_values = {
            'message': "Edits made: %d" % i
        }
        path = os.path.join(os.path.dirname(__file__), '../templates/message.html')
        self.response.out.write(template.render(path, template_values))
        """